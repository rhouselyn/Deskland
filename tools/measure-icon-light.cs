using System;using System.Diagnostics;using System.Threading;using System.Windows.Forms;
static class LightMeasure {
 [STAThread]static void Main(){
  Native.SetProcessDpiAwarenessContext(new IntPtr(-4));Application.EnableVisualStyles();
  using(var ui=new Control())using(var reader=new IconReader())using(var light=new DesktopIconLight()){
   var handle=ui.Handle;SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
   bool visible;var icons=reader.Read(out visible);if(icons==null||!visible)throw new Exception("Visible desktop required");
   var glyphs=new System.Collections.Generic.List<Native.RECT>();reader.ReadGlyphs(icons.Count,glyphs);
   var colors=new uint[icons.Count];for(int i=0;i<colors.Length;i++)colors[i]=0x6888bb55;
   foreach(var stage in new[]{"off","steady","animated","hidden"}){
    if(stage=="steady"){
     light.Update(reader.ListView,glyphs,colors,true);
     var ready=Stopwatch.StartNew();int loaded=0;
     while(ready.ElapsedMilliseconds<20000){
      Application.DoEvents();loaded=0;
      var entries=(System.Collections.IEnumerable)typeof(DesktopIconLight).GetField("entries",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Instance).GetValue(light);
      foreach(var entry in entries)if(entry.GetType().GetField("Window").GetValue(entry)!=null)loaded++;
      if(loaded==colors.Length)break;Thread.Sleep(10);
     }
     Console.WriteLine("Ready icon surfaces: "+loaded+"/"+colors.Length);
    }
    if(stage=="hidden")light.SetVisible(false);
    var warm=Stopwatch.StartNew();while(warm.ElapsedMilliseconds<1500){Application.DoEvents();Thread.Sleep(10);}
    var explorer=Process.GetProcessesByName("explorer")[0];var before=explorer.TotalProcessorTime.TotalSeconds;
    var own=Process.GetCurrentProcess();var ownBefore=own.TotalProcessorTime.TotalSeconds;
    var watch=Stopwatch.StartNew();int updates=0;long placement=0;
    while(watch.ElapsedMilliseconds<4000){
     if(stage=="animated"&&watch.ElapsedMilliseconds>=updates*80){updates++;for(int i=0;i<colors.Length;i++)colors[i]=(uint)(0x6888bb55+(updates%25)*0x01010100);light.Update(reader.ListView,glyphs,colors,false);}
     if(watch.ElapsedMilliseconds>=placement){placement+=400;light.RefreshPlacement();}Application.DoEvents();Thread.Sleep(10);
    }
    explorer.Refresh();own.Refresh();Console.WriteLine(stage+": Explorer "+((explorer.TotalProcessorTime.TotalSeconds-before)/watch.Elapsed.TotalSeconds*100).ToString("F1")+"%, overlay "+((own.TotalProcessorTime.TotalSeconds-ownBefore)/watch.Elapsed.TotalSeconds*100).ToString("F1")+"% of one core; "+updates+" updates");
   }
  }
 }
}
