using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// qianyiai/KuroCat runs independently; the pipe carries preferences and counters, never key events.
sealed class DesktopPet : IDisposable
{
    readonly Control dispatch=new Control();
    Process process;bool ready,disposed,awaiting;int total,kpm,revision;object cats;
    string error="";
    public event Action Changed,OpenRequested,PreferencesChanged;
    public static Dictionary<string,object> Defaults(){return Json.Obj("engine",47,"enabled",1,"breed","ragdoll","scale",53,"badges",1,"through",1,"topmost",1,"x",-99999,"y",-99999,"layout","65","orientation","cat","sound",0,"privacy",1,"mcp",0,"paused",0);}
    public static bool Valid(string key,object value){
        if(key=="breed")return value is string&&((string)value).Length>0&&((string)value).Length<=64&&System.Text.RegularExpressions.Regex.IsMatch((string)value,"^[a-zA-Z0-9_-]+$");
        if(key=="layout")return Equals(value,"65")||Equals(value,"108");
        if(key=="orientation")return Equals(value,"cat")||Equals(value,"viewer");
        if(!(value is int))return false;int v=(int)value;
        switch(key){case "engine":return v==47;case "scale":return v>=20&&v<=150;case "x":case "y":return v>=-100000&&v<=100000;
        case "enabled":case "badges":case "through":case "topmost":case "sound":case "privacy":case "mcp":case "paused":return v==0||v==1;default:return false;}
    }
    public static Dictionary<string,object> Migrate(Dictionary<string,object> old){
        var next=Defaults();if(old==null)return next;
        foreach(var p in old)if(Valid(p.Key,p.Value))next[p.Key]=p.Value;
        object v;if(!old.ContainsKey("engine")&&old.TryGetValue("coat",out v)&&v is int){int coat=(int)v;next["breed"]=coat==1?"siamese":coat==2?"tuxedo":coat==3?"orange-tabby":"black";}
        if(old.TryGetValue("scale",out v)&&v is int)next["scale"]=Math.Max(20,Math.Min(150,(int)v));
        return next;
    }
    public DesktopPet(){var handle=dispatch.Handle;}
    public string Message(){return Json.Stringify(Json.Obj("t","petState","v",Settings.Pet,"running",ready,"total",total,"kpm",kpm,"rawInput",ready,"cats",cats,"error",error));}
    void Notify(){if(Changed!=null)Changed();}
    void OnUi(Action action){if(disposed||dispatch.IsDisposed)return;try{dispatch.BeginInvoke(new Action(delegate{if(!disposed)action();}));}catch(InvalidOperationException){}}
    bool Flag(string key){return Equals(Settings.Pet[key],1);}
    object NativeSettings(){
        object x=null,y=null;
        if(!Equals(Settings.Pet["x"],-99999)&&!Equals(Settings.Pet["y"],-99999)){
            int px=(int)Settings.Pet["x"],py=(int)Settings.Pet["y"];
            var area=Screen.FromPoint(new Point(px,py)).WorkingArea;
            double dpi=GetDpiForSystem()/96.0,scale=(int)Settings.Pet["scale"]/100.0;
            int w=(int)Math.Ceiling(Math.Max(260,(Equals(Settings.Pet["layout"],"108")?540:420)*scale)*dpi);
            int h=(int)Math.Ceiling(Math.Max(410,(Equals(Settings.Pet["layout"],"108")?456:440)*scale)*dpi);
            x=Math.Max(area.Left,Math.Min(px,area.Right-w));y=Math.Max(area.Top,Math.Min(py,area.Bottom-h));
        }
        return Json.Obj("x",x,"y",y,
        "scale",(int)Settings.Pet["scale"]/100.0,"alwaysOnTop",Flag("topmost"),"clickThroughLocked",Flag("through"),"showKeyBubbles",Flag("badges"),"soundEnabled",Flag("sound"),"autostart",false,
        "catBreed",Settings.Pet["breed"],"mcpEnabled",Flag("mcp"),"mcpPort",27420,"keyboardLayout",Settings.Pet["layout"],"keyboardOrientation",Settings.Pet["orientation"],"privacyPasswordGuard",Flag("privacy"));}
    public void Apply(){
        if(disposed)return;if(!Flag("enabled")){Stop();Notify();return;}
        if(process==null){
            var exe=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"DesklandPet.exe");if(!File.Exists(exe)){error="missing";Notify();return;}
            try{
                var child=new Process{StartInfo=new ProcessStartInfo(exe,"--deskland "+Process.GetCurrentProcess().Id.ToString(CultureInfo.InvariantCulture)){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true}};
                child.StartInfo.EnvironmentVariables["WEBVIEW2_USER_DATA_FOLDER"]=Path.Combine(Log.DataDir,"WebView2");
                process=child;error="";ready=false;
                child.OutputDataReceived+=delegate(object s,DataReceivedEventArgs e){if(e.Data!=null)OnUi(delegate{if(process==child)Receive(e.Data);});};
                child.EnableRaisingEvents=true;child.Exited+=delegate{OnUi(delegate{if(process!=child)return;process=null;ready=false;child.Dispose();error="stopped";Notify();});};
                child.Start();child.BeginOutputReadLine();
            }catch(Exception ex){if(process!=null){process.Dispose();process=null;}error="start";Log.Write("启动桌宠失败："+ex.Message);}
        }else if(ready){awaiting=true;Write(Json.Obj("t","settings","v",NativeSettings(),"revision",++revision));Write(Json.Obj("t","pause","v",Flag("paused")));}
        Notify();
    }
    void Receive(string line){
        if(line.Length>1024*1024)return;
        Dictionary<string,object> m;try{m=Json.Parse(line) as Dictionary<string,object>;}catch{return;}if(m==null||!m.ContainsKey("t"))return;
        string type=m["t"] as string;
        if(type=="ready"){ready=true;Apply();return;}
        if(type=="open"){if(OpenRequested!=null)OpenRequested();return;}
        if(type=="error"){error="engine";Notify();return;}
        if(type=="stats"){total=Convert.ToInt32(m["total"]);kpm=Convert.ToInt32(m["kpm"]);Notify();return;}
        if(type!="engine"&&type!="applied")return;
        if(type=="applied"){if(Convert.ToInt32(m["revision"])!=revision)return;awaiting=false;}
        if(awaiting)return;
        var v=m["v"] as Dictionary<string,object>;if(v==null)return;bool changed=false;
        foreach(var pair in new[]{"breed:catBreed","layout:keyboardLayout","orientation:keyboardOrientation","topmost:alwaysOnTop","through:clickThroughLocked","badges:showKeyBubbles","sound:soundEnabled","privacy:privacyPasswordGuard","mcp:mcpEnabled","x:x","y:y","scale:scale"}){
            var names=pair.Split(':');object value;if(!v.TryGetValue(names[1],out value)||value==null)continue;
            if(value is bool)value=(bool)value?1:0;if(names[0]=="scale")value=(int)Math.Round(Convert.ToDouble(value)*100);
            if(Valid(names[0],value)&&!Equals(Settings.Pet[names[0]],value)){Settings.Pet[names[0]]=value;changed=true;}
        }
        if(m.ContainsKey("cats"))cats=m["cats"];error="";
        if(changed&&PreferencesChanged!=null)PreferencesChanged();Notify();
    }
    void Write(object message){try{if(process!=null&&!process.HasExited)process.StandardInput.WriteLine(Json.Stringify(message));}catch(IOException){error="pipe";Notify();}catch(InvalidOperationException){}}
    public void InvokeAction(string name){if(name=="demo"||name=="position")Write(Json.Obj("t",name));}
    public void SaveSkin(object skin){Write(Json.Obj("t","skin","v",skin));}
    public void DeleteSkin(string id){if(Valid("breed",id))Write(Json.Obj("t","deleteSkin","id",id));}
    void Stop(){var child=process;process=null;ready=false;awaiting=false;if(child==null)return;try{child.StandardInput.WriteLine("{\"t\":\"exit\"}");if(!child.WaitForExit(1200))child.Kill();}catch(InvalidOperationException){}catch(IOException){}finally{child.Dispose();}}
    public void Dispose(){if(disposed)return;disposed=true;Stop();dispatch.Dispose();}
    [DllImport("user32.dll")]static extern uint GetDpiForSystem();
}
