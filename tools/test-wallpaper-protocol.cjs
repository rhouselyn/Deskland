const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'host/DesktopHost.cs'),'utf8');
const start=source.indexOf('core.WebMessageReceived += delegate',source.indexOf('class WallpaperForm'));
const body=source.slice(source.indexOf('{',start),source.indexOf('\n            };',start)+14).trim();
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deskland-protocol-'));
const code=`using System;using System.IO;
class Args {public string Source,Message;public string TryGetWebMessageAsString(){return Message;}}
class Core {public int Settings;public void PostWebMessageAsString(string s){Settings++;}}
static class PastoralStore {public static string Load(){return null;}public static bool Valid(string s){return true;}public static void Save(string s){}}
class Test {
 string page="meadow.html",layoutGeometry="",lastIcons="";int lastPause=0,polls=0;public string LastWorld;
 string PageUrl {get{return "https://app.local/"+page+"?wallpaper=1";}}
 public Func<string> SettingsJson=()=>"settings";public Action<string> WorldChanged,RecordProgress;
 Core core=new Core();void Post(string s){}void ReceiveIconLight(string s){}void OnSnapshot(string s){}void OnRecord(string s){}
 void PollIcons(){polls++;}void PollForeground(){}
 void Receive(Args a) ${body}
 static void Main(){try{Run();}catch(Exception e){Console.WriteLine("FAIL: "+e.Message);Environment.ExitCode=1;}}
 static void Run(){var t=new Test();
  foreach(var msg in new[]{"world-save|{}","world-load","icon-light|1|11223344","unknown"})
   t.Receive(new Args{Source="https://app.local/pastoral.html?wallpaper=1",Message=msg});
  if(t.core.Settings!=0||t.polls!=0)throw new Exception("Old/unknown page messages reinitialize current wallpaper: "+t.core.Settings);
  t.Receive(new Args{Source=t.PageUrl,Message="unknown"});
  if(t.core.Settings!=0)throw new Exception("Only ready may initialize the page");
  t.Receive(new Args{Source=t.PageUrl,Message="ready"});
  if(t.core.Settings!=1||t.polls!=1)throw new Exception("Current ready must initialize exactly once");
  Console.WriteLine("PASS: stale and unknown messages never reset settings, geometry or pause");
 }
}`;
fs.writeFileSync(path.join(dir,'test.cs'),code);
const exe=path.join(dir,'test.exe');
const built=spawnSync(path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/out:'+exe,path.join(dir,'test.cs')],{encoding:'utf8'});
assert.equal(built.status,0,built.stdout+built.stderr);
const run=spawnSync(exe,[],{encoding:'utf8'});
process.stdout.write(run.stdout+run.stderr);
assert.equal(run.status,0,'wallpaper message routing regression');
