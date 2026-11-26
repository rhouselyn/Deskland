using System;
using System.Collections.Generic;
using System.Reflection;
using System.Web.Script.Serialization;
static class Json {
    public static object Parse(string s){return new JavaScriptSerializer().DeserializeObject(s);}
    public static string Stringify(object v){return new JavaScriptSerializer().Serialize(v);}
    public static Dictionary<string,object> Obj(params object[] p){var d=new Dictionary<string,object>();for(int i=0;i<p.Length;i+=2)d[(string)p[i]]=p[i+1];return d;}
}
static class Settings { public static Dictionary<string,object> Pet=DesktopPet.Defaults(); }
static class Log { public static string DataDir=System.IO.Path.GetTempPath();public static void Write(string s){} }
class PetSettingsTests {
    static void Check(bool v,string message){if(!v)throw new Exception(message);}
    [STAThread] static void Main(){
        var d=DesktopPet.Defaults();Check(Equals(d["breed"],"ragdoll")&&Equals(d["scale"],53)&&Equals(d["enabled"],1)&&Equals(d["through"],1)&&Equals(d["sound"],0)&&Equals(d["mcp"],0)&&Equals(d["privacy"],1),"safe defaults");
        foreach(int size in new[]{20,100,150})Check(DesktopPet.Valid("scale",size),"new size range");
        foreach(object size in new object[]{19,151,"100",Double.NaN})Check(!DesktopPet.Valid("scale",size),"reject invalid size");
        Check(!DesktopPet.Valid("breed","../bad")&&!DesktopPet.Valid("layout","104")&&!DesktopPet.Valid("through",true),"validate pipe boundary");
        var old=Json.Obj("enabled",1,"coat",1,"scale",200,"through",1,"x",120,"y",240,"eyes",2);
        var migrated=DesktopPet.Migrate(old);Check(Equals(migrated["breed"],"siamese")&&Equals(migrated["scale"],150)&&Equals(migrated["x"],120)&&Equals(migrated["through"],1),"legacy preferences migrate");
        Check(!migrated.ContainsKey("coat")&&!migrated.ContainsKey("eyes")&&Equals(old["scale"],200),"legacy source remains intact");
        Check(Json.Stringify(DesktopPet.Migrate(migrated))==Json.Stringify(migrated),"migration is idempotent");
        using(var pet=new DesktopPet()){
            var receive=typeof(DesktopPet).GetMethod("Receive",BindingFlags.Instance|BindingFlags.NonPublic);
            receive.Invoke(pet,new object[]{Json.Stringify(Json.Obj("t","engine","v",Json.Obj("catBreed","dafeiyu","scale",.65,"alwaysOnTop",true,"clickThroughLocked",false,"soundEnabled",true,"privacyPasswordGuard",true,"mcpEnabled",false,"keyboardLayout","108","keyboardOrientation","viewer","x",123,"y",456),"cats",new object[0]))});
            Check(Equals(Settings.Pet["breed"],"dafeiyu")&&Equals(Settings.Pet["scale"],65)&&Equals(Settings.Pet["layout"],"108"),"engine preferences flow back to host");
            typeof(DesktopPet).GetField("awaiting",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(pet,true);
            receive.Invoke(pet,new object[]{"{\"t\":\"engine\",\"v\":{\"catBreed\":\"black\"}}"});
            Check(Equals(Settings.Pet["breed"],"dafeiyu"),"stale snapshots cannot overwrite pending edits");
        }
        Console.WriteLine("PASS: defaults, validation, legacy migration, idempotence, engine roundtrip and pending-edit protection");
    }
}
