using System;using System.Drawing;using System.Reflection;using System.Runtime.InteropServices;using System.Windows.Forms;
static class Log{public static void Write(string message){}}
static class Native{
 [StructLayout(LayoutKind.Sequential)]public struct RECT{public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)]public struct POINT{public int X,Y;}
 public const int WS_CHILD=0x40000000,WS_POPUP=unchecked((int)0x80000000),WS_EX_LAYERED=0x80000;public const uint SWP_SHOWWINDOW=0x40,SWP_NOACTIVATE=0x10;
 [DllImport("user32.dll")]public static extern IntPtr GetParent(IntPtr h);
 [DllImport("user32.dll")]public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")]public static extern IntPtr GetWindow(IntPtr h,uint command);
 [DllImport("user32.dll")]public static extern int GetWindowLong(IntPtr h,int index);
 [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int command);
 [DllImport("user32.dll")]public static extern bool ClientToScreen(IntPtr h,ref POINT p);
 [DllImport("user32.dll")]public static extern bool ScreenToClient(IntPtr h,ref POINT p);
 [DllImport("user32.dll")]public static extern bool SetLayeredWindowAttributes(IntPtr h,uint color,byte alpha,uint flags);
 [DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
 [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")]public static extern int GetWindowRgn(IntPtr h,IntPtr region);
 [DllImport("gdi32.dll")]public static extern IntPtr CreateRectRgn(int l,int t,int r,int b);
 [DllImport("gdi32.dll")]public static extern bool DeleteObject(IntPtr h);
 [DllImport("user32.dll")]public static extern uint GetGuiResources(IntPtr process,uint flags);
}
static class IconLightTest{
 sealed class PassiveFrame:Form{protected override bool ShowWithoutActivation{get{return true;}}}
 [STAThread]static void Main(){try{Run();}catch(Exception error){Console.WriteLine("FAIL: "+(error.InnerException??error).Message);Environment.ExitCode=1;}}
 static void Run(){
  using(var frame=new PassiveFrame())using(var list=new ListView())using(var app=new Form()){
   frame.Location=new Point(-20000,-20000);list.Bounds=new Rectangle(27,41,300,200);frame.Controls.Add(list);
   frame.ShowInTaskbar=false;frame.Show();
   var owner=frame.Handle;var listHandle=list.Handle;
   var type=typeof(DesktopIconLight).GetNestedType("Patch",BindingFlags.NonPublic);
   using(var patch=(Control)Activator.CreateInstance(type,new object[]{listHandle,new Region(new Rectangle(4,5,20,18))})){
    var bounds=new Rectangle(10,15,32,32);
    type.GetMethod("PaintAt").Invoke(patch,new object[]{bounds,0x45678933u});
    var region=Native.CreateRectRgn(0,0,0,0);
    try{if(Native.GetWindowRgn(patch.Handle,region)!=0)throw new Exception("Animated tint must use a local alpha bitmap, without a complex native window region");}finally{Native.DeleteObject(region);}
    var storage=type.GetField("bits",BindingFlags.NonPublic|BindingFlags.Instance);
    var bits=(IntPtr)storage.GetValue(patch);
    if(Marshal.ReadInt32(bits)!=0||Marshal.ReadInt32(bits,(7*32+6)*4)!=unchecked((int)0xff456789))throw new Exception("Local bitmap must preserve transparent padding and the icon tint");
    type.GetMethod("PaintAt").Invoke(patch,new object[]{bounds,0x33669980u});
    if((IntPtr)storage.GetValue(patch)!=bits||Marshal.ReadInt32(bits,(7*32+6)*4)!=unchecked((int)0xff336699))throw new Exception("Color changes must reuse bitmap storage and preserve premultiplied alpha");
    using(var process=System.Diagnostics.Process.GetCurrentProcess()){
     uint before=Native.GetGuiResources(process.Handle,0);
     for(uint i=0;i<200;i++)type.GetMethod("PaintAt").Invoke(patch,new object[]{bounds,0x33660080u+(i<<8)});
     if(Native.GetGuiResources(process.Handle,0)>before+1||(IntPtr)storage.GetValue(patch)!=bits)throw new Exception("Repeated tint updates must not allocate GDI objects or bitmap storage");
    }
    if(Native.GetParent(patch.Handle)!=IntPtr.Zero)throw new Exception("Illumination must not insert windows into Explorer's window tree");
    int ex=Native.GetWindowLong(patch.Handle,-20);
    if((ex&0x80020)!=0x80020||(ex&0x80)==0||(ex&8)!=0)throw new Exception("Overlay must remain transparent, hidden from task switching and non-topmost");
    var expected=new Native.POINT{X=bounds.Left,Y=bounds.Top};Native.ClientToScreen(listHandle,ref expected);
    Native.RECT actual;Native.GetWindowRect(patch.Handle,out actual);
    if(actual.Left!=expected.X||actual.Top!=expected.Y||actual.Right-actual.Left!=32)throw new Exception("Moving the overlay must preserve the exact glyph position: expected "+expected.X+","+expected.Y+" actual "+actual.Left+","+actual.Top+" width "+(actual.Right-actual.Left));
    var foreground=Native.GetForegroundWindow();var appHandle=app.Handle;
    Native.SetWindowPos(appHandle,IntPtr.Zero,0,0,0,0,0x13);
    type.GetMethod("RestorePlacement").Invoke(patch,null);
    if(!Above(appHandle,patch.Handle)||!(bool)type.GetMethod("AboveDesktop").Invoke(patch,null))throw new Exception("Overlay must remain below normal apps and above the desktop");
    Native.SetWindowPos(owner,IntPtr.Zero,0,0,0,0,0x13);
    type.GetMethod("RestorePlacement").Invoke(patch,null);
    if(!(bool)type.GetMethod("AboveDesktop").Invoke(patch,null))throw new Exception("Overlay must recover after Show Desktop changes the Z order");
    if(Native.GetForegroundWindow()!=foreground)throw new Exception("Overlay placement must not activate a window");
    using(var light=new DesktopIconLight()){
     var entryType=typeof(DesktopIconLight).GetNestedType("Entry",BindingFlags.NonPublic);
     var entry=Activator.CreateInstance(entryType,true);entryType.GetField("Window").SetValue(entry,patch);
     entryType.GetField("Bounds").SetValue(entry,bounds);entryType.GetField("Color").SetValue(entry,0x45678933u);
     var entries=(System.Collections.IList)typeof(DesktopIconLight).GetField("entries",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(light);entries.Add(entry);
     var group=new System.Collections.Generic.List<Control>{patch};
     for(int i=1;i<43;i++){
      var sibling=(Control)Activator.CreateInstance(type,new object[]{listHandle,new Region(new Rectangle(4,5,20,18))});
      var at=new Rectangle(bounds.X+i*40,bounds.Y,32,32);type.GetMethod("PaintAt").Invoke(sibling,new object[]{at,0x45678933u});group.Add(sibling);
      var other=Activator.CreateInstance(entryType,true);entryType.GetField("Window").SetValue(other,sibling);entryType.GetField("Bounds").SetValue(other,at);entryType.GetField("Color").SetValue(other,0x45678933u);entries.Add(other);
     }
     typeof(DesktopIconLight).GetField("list",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(light,listHandle);
     var watch=typeof(DesktopIconLight).GetMethod("WatchPlacement",BindingFlags.Instance|BindingFlags.NonPublic);
     if(watch==null)throw new Exception("Returning to desktop must recover from window events without waiting for the icon polling timer");
     watch.Invoke(light,null);
     var visibility=typeof(DesktopIconLight).GetMethod("SetVisible");
     if(visibility==null)throw new Exception("Temporary desktop hiding needs a cache-preserving visibility operation");
     var handle=patch.Handle;
     visibility.Invoke(light,new object[]{false});
     type.GetMethod("PrepareAt").Invoke(patch,new object[]{bounds,0x45678933u});
     if(Native.IsWindowVisible(handle))throw new Exception("Preparing cached pixels must not show one icon before its group");
     visibility.Invoke(light,new object[]{true});Application.DoEvents();
     for(int i=0;i<20;i++){
      visibility.Invoke(light,new object[]{false});light.RefreshPlacement();
      if(Native.IsWindowVisible(handle)||patch.IsDisposed)throw new Exception("Hidden desktop must retain, but never show, its cached overlay");
      visibility.Invoke(light,new object[]{true});
      if(patch.Handle!=handle||!Native.IsWindowVisible(handle))throw new Exception("Returning to desktop must reuse the same overlay window");
      Application.DoEvents();
     }
     // Show Desktop can restore an app inside the existing overlay band. Every
     // overlay is still above the desktop, so that check alone misses the app.
     Native.SetWindowPos(appHandle,group[0].Handle,0,0,0,0,0x13);
     light.RefreshPlacement();
     foreach(var sibling in group)
      if(!Above(appHandle,sibling.Handle))throw new Exception("Restored apps must stay above the whole overlay group even when all overlays already sit above the desktop");
     Native.SetWindowPos(appHandle,group[0].Handle,0,0,0,0,0x13);
     typeof(DesktopIconLight).GetMethod("OnPlacementEvent",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(light,new object[]{IntPtr.Zero,3u,appHandle,0,0,0u,0u});
     var restoreDeadline=System.Diagnostics.Stopwatch.StartNew();
     while(restoreDeadline.ElapsedMilliseconds<250&&!Above(appHandle,group[0].Handle)){Application.DoEvents();System.Threading.Thread.Sleep(1);}
     foreach(var sibling in group)
      if(!Above(appHandle,sibling.Handle))throw new Exception("Foreground restore events must put all masks behind the app without a click or polling tick");
     Console.WriteLine("App restore event recovery: "+restoreDeadline.ElapsedMilliseconds+" ms");
     Native.SetWindowPos(owner,IntPtr.Zero,0,0,0,0,0x13);
     // Replay Show Desktop's foreground notification without activating the test window.
     typeof(DesktopIconLight).GetMethod("OnPlacementEvent",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(light,new object[]{IntPtr.Zero,3u,owner,0,0,0u,0u});
     var deadline=System.Diagnostics.Stopwatch.StartNew();
     while(deadline.ElapsedMilliseconds<250&&!(bool)type.GetMethod("AboveDesktop").Invoke(patch,null)){Application.DoEvents();System.Threading.Thread.Sleep(1);}
     if(!(bool)type.GetMethod("AboveDesktop").Invoke(patch,null))throw new Exception("Desktop reorder must restore cached illumination from its event, without a timer tick");
     Console.WriteLine("Desktop reorder event recovery: "+deadline.ElapsedMilliseconds+" ms");
     foreach(var sibling in group)if(!(bool)type.GetMethod("AboveDesktop").Invoke(sibling,null)||!Native.IsWindowVisible(sibling.Handle))throw new Exception("The whole cached group must recover together");
     Native.ShowWindow(handle,0);deadline.Restart();
     while(deadline.ElapsedMilliseconds<250&&!Native.IsWindowVisible(handle)){Application.DoEvents();System.Threading.Thread.Sleep(1);}
     if(!Native.IsWindowVisible(handle)||patch.Handle!=handle||(IntPtr)storage.GetValue(patch)!=bits)throw new Exception("Shell hiding the overlay must restore the same window and pixels from its event");
     Console.WriteLine("Shell hide event recovery: "+deadline.ElapsedMilliseconds+" ms");
     list.Hide();visibility.Invoke(light,new object[]{false});Application.DoEvents();
     if(Native.IsWindowVisible(handle))throw new Exception("A hidden desktop list must keep illumination hidden");
     list.Show();deadline.Restart();
     while(deadline.ElapsedMilliseconds<250&&!Native.IsWindowVisible(handle)){Application.DoEvents();System.Threading.Thread.Sleep(1);}
     if(!Native.IsWindowVisible(handle)||patch.Handle!=handle)throw new Exception("Desktop list show must restore cached illumination without waiting for the poller");
     Console.WriteLine("Desktop show event recovery: "+deadline.ElapsedMilliseconds+" ms");
     if(Native.GetForegroundWindow()!=foreground)throw new Exception("Event recovery must not steal focus");
     light.Clear();Application.DoEvents();
     if(typeof(DesktopIconLight).GetField("placementHooks",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(light)!=null)throw new Exception("Disabling illumination must release its event hooks");
    }
   }
  }
  Console.WriteLine("PASS: illumination has no foreign parent/owner and maps glyph coordinates correctly");
 }
 static bool Above(IntPtr a,IntPtr b){for(var h=a;h!=IntPtr.Zero;h=Native.GetWindow(h,2))if(h==b)return true;return false;}
}
