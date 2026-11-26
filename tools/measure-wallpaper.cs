using System;using System.Diagnostics;using System.IO;using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;
static class WallpaperMeasure {
 [STAThread]static void Main(string[] args){
  Native.SetProcessDpiAwarenessContext(new IntPtr(-4));Application.EnableVisualStyles();
  Settings.Theme="pastoral";I18n.Load(args[0],"zh-CN");WallpaperForm.AttachMode=args[1];
  using(var form=new WallpaperForm(args[0],"pastoral.html",true)){
   form.SettingsJson=()=>"{\"t\":\"settings\",\"v\":{\"iconLighting\":0,\"pauseWhenCovered\":0}}";
   var timer=new Timer{Interval=100};int stage=0;double before=0,ownBefore=0,webBefore=0;
   var explorer=Process.GetProcessesByName("explorer")[0];var own=Process.GetCurrentProcess();
   var clock=Stopwatch.StartNew();bool sampled=false;
   Func<double> webCpu=delegate{double sum=0;var view=(WebView2)form.Controls[0];if(view.CoreWebView2!=null)foreach(var item in view.CoreWebView2.Environment.GetProcessInfos())try{using(var p=Process.GetProcessById(item.ProcessId))sum+=p.TotalProcessorTime.TotalSeconds;}catch(ArgumentException){}return sum;};
   string[] names={"paused","animated-no-light","animated-light","paused-again"};
   timer.Tick+=delegate{
    if(clock.Elapsed.TotalSeconds>=4&&!sampled){explorer.Refresh();own.Refresh();before=explorer.TotalProcessorTime.TotalSeconds;ownBefore=own.TotalProcessorTime.TotalSeconds;webBefore=webCpu();sampled=true;}
    if(clock.Elapsed.TotalSeconds<8)return;
    explorer.Refresh();own.Refresh();Console.WriteLine(args[1]+" "+names[stage]+": Explorer "+((explorer.TotalProcessorTime.TotalSeconds-before)/4*100).ToString("F1")+"%, host "+((own.TotalProcessorTime.TotalSeconds-ownBefore)/4*100).ToString("F1")+"%, WebView "+((webCpu()-webBefore)/4*100).ToString("F1")+"% of one core");
    stage++;if(stage==names.Length){timer.Stop();form.Shutdown();return;}
    form.Post("{\"t\":\"settings\",\"v\":{\"iconLighting\":"+(stage==2?1:0)+"}}");form.SetManualPause(stage==3);
    clock.Restart();sampled=false;
   };
   form.Shown+=delegate{clock.Restart();timer.Start();};Application.Run(form);timer.Dispose();
  }
 }
}
