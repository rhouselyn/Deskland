$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot
$probeDir=Join-Path $env:TEMP ('deskland-sharing-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $probeDir | Out-Null
$code=@'
using System;using System.Diagnostics;using System.Globalization;using System.IO;using System.Management;using System.Runtime.InteropServices;using System.Threading.Tasks;using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;using Microsoft.Web.WebView2.WinForms;
class SharingProbe:Form {
 readonly string data,pet;readonly bool petFirst;Process child;WebView2 web=new WebView2();
 public SharingProbe(string[] args){data=args[0];pet=args[1];petFirst=args[2]=="pet-first";ShowInTaskbar=false;SetBounds(-20000,-20000,16,16);Controls.Add(web);}
 protected override bool ShowWithoutActivation {get{return true;}}
 async Task StartPet(){
  child=new Process{StartInfo=new ProcessStartInfo(pet,"--deskland "+Process.GetCurrentProcess().Id){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true}};
  child.StartInfo.EnvironmentVariables["WEBVIEW2_USER_DATA_FOLDER"]=Path.Combine(data,"WebView2");
  child.StartInfo.EnvironmentVariables["LOCALAPPDATA"]=data;child.StartInfo.EnvironmentVariables["APPDATA"]=data;
  child.Start();
  while(true){var read=child.StandardOutput.ReadLineAsync();if(await Task.WhenAny(read,Task.Delay(20000))!=read)throw new Exception("Pet startup timeout");var line=await read;if(line==null)throw new Exception("Pet exited before ready");if(line.Contains("\"t\":\"ready\""))break;}
 }
 async Task StartWeb(){
  var options=new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required",CultureInfo.InstalledUICulture.Name);
  var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(data,"WebView2"),options);
  await web.EnsureCoreWebView2Async(env);web.CoreWebView2.NavigateToString("<html><body>Sharing test</body></html>");
 }
 protected override async void OnShown(EventArgs e){base.OnShown(e);try{
  if(petFirst){await StartPet();await StartWeb();}else{await StartWeb();await StartPet();}
  await Task.Delay(1000);
  int browsers=0;using(var query=new ManagementObjectSearcher("SELECT ProcessId,ParentProcessId,CommandLine FROM Win32_Process WHERE Name='msedgewebview2.exe'"))
   foreach(ManagementObject p in query.Get()){int parent=Convert.ToInt32(p["ParentProcessId"]);if(parent==child.Id||parent==Process.GetCurrentProcess().Id){var cmd=(string)p["CommandLine"]??"";if(!cmd.Contains("--type="))browsers++;}}
  if(browsers!=1)throw new Exception("Expected one shared browser, got "+browsers);
  Console.WriteLine("PASS: "+(petFirst?"pet-first":"host-first")+" shares browser PID "+web.CoreWebView2.BrowserProcessId);
  uint browser=web.CoreWebView2.BrowserProcessId;
  child.StandardInput.WriteLine("{\"t\":\"exit\"}");if(!child.WaitForExit(10000))throw new Exception("Pet did not exit");child.Dispose();child=null;
  if(await web.CoreWebView2.ExecuteScriptAsync("6*7")!="42")throw new Exception("Pet exit disrupted host renderer");
  await StartPet();
  if(web.CoreWebView2.BrowserProcessId!=browser)throw new Exception("Pet restart replaced shared browser");
  Console.WriteLine("PASS: pet off/on preserves the host renderer and shared browser");
 }catch(Exception error){Console.WriteLine("FAIL: "+error.Message);Environment.ExitCode=1;}finally{
  if(child!=null){try{child.StandardInput.WriteLine("{\"t\":\"exit\"}");if(!child.WaitForExit(10000))child.Kill();}catch{}child.Dispose();}web.Dispose();Close();
 }}
 [DllImport("user32.dll")]static extern bool SetProcessDpiAwarenessContext(IntPtr value);
 [STAThread]static void Main(string[] args){SetProcessDpiAwarenessContext(new IntPtr(-4));Application.EnableVisualStyles();Application.Run(new SharingProbe(args));}
}
'@
[IO.File]::WriteAllText((Join-Path $probeDir 'test.cs'),$code)
$lib=Join-Path $repoRoot 'host\lib'
$exe=Join-Path $probeDir 'test.exe'
& "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:exe "/out:$exe" /r:System.dll /r:System.Management.dll /r:System.Windows.Forms.dll "/r:$lib\Microsoft.Web.WebView2.Core.dll" "/r:$lib\Microsoft.Web.WebView2.WinForms.dll" (Join-Path $probeDir 'test.cs')
if($LASTEXITCODE -ne 0){throw 'Sharing probe compilation failed'}
Copy-Item (Join-Path $lib 'Microsoft.Web.WebView2*.dll') $probeDir
Copy-Item (Join-Path $lib 'WebView2Loader.dll') $probeDir
$pet=Join-Path $repoRoot 'third_party\KuroCat\src-tauri\target\release\DesklandPet.exe'
foreach($order in @('pet-first','host-first')){
 & $exe (Join-Path $probeDir $order) $pet $order
 if($LASTEXITCODE -ne 0){throw "Shared WebView2 failed: $order"}
}
