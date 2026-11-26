using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Collections.Concurrent;
using System.Threading;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// Unowned, input-transparent windows keep Explorer's window tree and native
// mouse tracking untouched. They stay directly above the desktop, below apps.
sealed class DesktopIconLight : IDisposable
{
    sealed class Patch : Control
    {
        readonly IntPtr list;
        readonly Region shape;
        IntPtr surface, bitmap, oldBitmap, bits;
        byte[] alpha;
        int[] pixels;
        Size surfaceSize;
        public Patch(IntPtr list, Region shape)
        {
            this.list = list;
            this.shape = shape;
            TabStop = false;
        }
        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.Parent = IntPtr.Zero;
                cp.Style = Native.WS_POPUP | 0x08000000; // WS_DISABLED
                cp.ExStyle = Native.WS_EX_LAYERED | 0x20 | 0x80 | 0x08000000; // transparent, tool window, no activate
                return cp;
            }
        }
        uint previous;
        bool PrepareSurface(Size size)
        {
            if (surface != IntPtr.Zero && surfaceSize == size) return false;
            ReleaseSurface();
            surfaceSize = size;
            surface = CreateCompatibleDC(IntPtr.Zero);
            var info = new BitmapInfo { Size=40, Width=size.Width, Height=-size.Height, Planes=1, Bits=32 };
            bitmap = CreateDIBSection(surface, ref info, 0, out bits, IntPtr.Zero, 0);
            if (surface == IntPtr.Zero || bitmap == IntPtr.Zero) { ReleaseSurface();throw new System.ComponentModel.Win32Exception(); }
            oldBitmap = SelectObject(surface, bitmap);
            alpha = new byte[size.Width * size.Height];pixels = new int[alpha.Length];
            using (var mask = new Bitmap(size.Width,size.Height,System.Drawing.Imaging.PixelFormat.Format32bppPArgb))
            {
                using (var g = Graphics.FromImage(mask)) g.FillRegion(Brushes.White,shape);
                var locked = mask.LockBits(new Rectangle(Point.Empty,size),System.Drawing.Imaging.ImageLockMode.ReadOnly,System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
                try
                {
                    var row = new byte[size.Width*4];
                    for (int y=0;y<size.Height;y++)
                    {
                        Marshal.Copy(IntPtr.Add(locked.Scan0,y*locked.Stride),row,0,row.Length);
                        for(int x=0;x<size.Width;x++) alpha[y*size.Width+x]=row[x*4+3];
                    }
                }
                finally { mask.UnlockBits(locked); }
            }
            return true;
        }
        void ReleaseSurface()
        {
            if(surface!=IntPtr.Zero && oldBitmap!=IntPtr.Zero) SelectObject(surface,oldBitmap);
            if(bitmap!=IntPtr.Zero) DeleteObject(bitmap);
            if(surface!=IntPtr.Zero) DeleteDC(surface);
            surface=bitmap=oldBitmap=bits=IntPtr.Zero;
        }
        protected override void Dispose(bool disposing)
        {
            ReleaseSurface();if(disposing)shape.Dispose();base.Dispose(disposing);
        }
        public void PaintAt(Rectangle bounds, uint rgba)
        { PaintSurface(bounds,rgba,true); }
        public void PrepareAt(Rectangle bounds, uint rgba)
        { PaintSurface(bounds,rgba,false); }
        void PaintSurface(Rectangle bounds, uint rgba, bool show)
        {
            var origin = new Native.POINT { X = bounds.X, Y = bounds.Y };
            if (!Native.ClientToScreen(list, ref origin)) return;
            bounds.Location = new Point(origin.X, origin.Y);
            bool fresh = PrepareSurface(bounds.Size);
            if (fresh || (rgba >> 8) != (previous >> 8))
            {
                int r=(int)(rgba>>24),g=(int)((rgba>>16)&255),b=(int)((rgba>>8)&255);
                for(int i=0;i<pixels.Length;i++)
                {
                    int a=alpha[i];pixels[i]=unchecked((int)((uint)a<<24))|((r*a+127)/255<<16)|((g*a+127)/255<<8)|(b*a+127)/255;
                }
                Marshal.Copy(pixels,0,bits,pixels.Length);
            }
            if (fresh || !IsHandleCreated || rgba != previous || Bounds != bounds)
            {
                var source = new Native.POINT();var size = bounds.Size;
                var blend = new Blend { Alpha=(byte)rgba, Format=1 };
                // A small per-pixel surface avoids recomposing Explorer's complex icon regions.
                if(!UpdateLayeredWindow(Handle,IntPtr.Zero,ref origin,ref size,surface,ref source,0,ref blend,2))return;
                previous = rgba;
            }
            if (show && (Bounds != bounds || !Native.IsWindowVisible(Handle)))
                Place(bounds);
        }
        public IntPtr DesktopRoot { get { return Native.GetAncestor(list,2); } }
        public bool AboveDesktop()
        {
            for (IntPtr h = Native.GetWindow(Native.GetAncestor(list, 2), 3); h != IntPtr.Zero; h = Native.GetWindow(h, 3))
                if (h == Handle) return true;
            return false;
        }
        public void RestorePlacement() { Place(Bounds); }
        void Place(Rectangle bounds)
        {
            IntPtr root = Native.GetAncestor(list, 2);
            if (root == IntPtr.Zero) return;
            IntPtr after = Native.GetWindow(root, 3); // predecessor in the top-level Z order
            if (after == Handle) after = Native.GetWindow(Handle, 3);
            // Inserting after a topmost app would promote this window into that band.
            if (after != IntPtr.Zero && (Native.GetWindowLong(after, -20) & 8) != 0) after = IntPtr.Zero;
            Native.SetWindowPos(Handle, after, bounds.X, bounds.Y, bounds.Width, bounds.Height,
                Native.SWP_SHOWWINDOW | Native.SWP_NOACTIVATE);
        }
    }
    sealed class Entry
    {
        public string Key;
        public Rectangle Bounds;
        public uint Color;
        public bool Pending;
        public int Generation;
        public DateTime Retry;
        public Patch Window;
    }
    readonly List<Entry> entries = new List<Entry>();
    BlockingCollection<Action> jobs;
    FolderView view;
    IntPtr list;
    DateTime retry;
    bool reported;
    bool visible = true;
    readonly WinEventProc placementEvent;
    IntPtr[] placementHooks;
    bool placementQueued,restoring,hiddenWithDesktop;
    int placementRevision;
    public DesktopIconLight() { placementEvent=OnPlacementEvent; }
    void WatchPlacement()
    {
        if(placementHooks!=null)return;
        uint shell;GetWindowThreadProcessId(list,out shell);
        uint own=(uint)System.Diagnostics.Process.GetCurrentProcess().Id;
        // Foreground/minimize/desktop transitions and Shell hiding/reordering our windows.
        placementHooks=new[]{
            SetWinEventHook(3,3,IntPtr.Zero,placementEvent,0,0,0),
            SetWinEventHook(0x17,0x17,IntPtr.Zero,placementEvent,0,0,0),
            SetWinEventHook(0x20,0x20,IntPtr.Zero,placementEvent,0,0,0),
            SetWinEventHook(0x8002,0x8004,IntPtr.Zero,placementEvent,shell,0,0),
            shell==own?IntPtr.Zero:SetWinEventHook(0x8002,0x8004,IntPtr.Zero,placementEvent,own,0,0)
        };
    }
    void OnPlacementEvent(IntPtr hook,uint ev,IntPtr hwnd,int objectId,int childId,uint thread,uint time)
    {
        if((!visible&&!hiddenWithDesktop)||restoring||placementQueued||entries.Count==0||list==IntPtr.Zero)return;
        if(ev>=0x8000)
        {
            if(objectId!=0)return;
            bool relevant=hwnd==list||hwnd==Native.GetAncestor(list,2);
            foreach(var e in entries)if(e.Window!=null&&e.Window.IsHandleCreated&&e.Window.Handle==hwnd)relevant=true;
            if(!relevant)return;
        }
        foreach(var e in entries)if(e.Window!=null&&!e.Window.IsDisposed&&e.Window.IsHandleCreated)
        {
            int revision=placementRevision;placementQueued=true;
            try { e.Window.BeginInvoke(new Action(delegate {
                if(revision!=placementRevision)return;
                placementQueued=false;
                if(hiddenWithDesktop&&Native.IsWindowVisible(list))SetVisible(true);
                else RefreshPlacement();
            })); }
            catch(InvalidOperationException) { placementQueued=false; }
            break;
        }
    }
    public void SetVisible(bool value)
    {
        if (visible == value) return;
        visible = value;
        hiddenWithDesktop=!value&&list!=IntPtr.Zero&&!Native.IsWindowVisible(list);
        foreach (var e in entries) if (e.Window != null)
        {
            if (value) e.Window.PrepareAt(e.Bounds, e.Color);
            else Native.ShowWindow(e.Window.Handle, 0);
        }
        if(value)RestorePlacement(true);
    }
    public void Clear()
    {
        placementRevision++;placementQueued=false;hiddenWithDesktop=false;
        if(placementHooks!=null){foreach(var hook in placementHooks)if(hook!=IntPtr.Zero)UnhookWinEvent(hook);placementHooks=null;}
        foreach (var e in entries)
        {
            e.Key = null;
            if (e.Window != null) e.Window.Dispose();
        }
        if (jobs != null) { jobs.CompleteAdding(); jobs = null; }
        entries.Clear();
    }
    public void Dispose()
    {
        Clear();
        if (view != null) Marshal.ReleaseComObject(view);
        view = null; list = IntPtr.Zero;
    }

    public void RefreshPlacement()
    { RestorePlacement(false); }
    void RestorePlacement(bool force)
    {
        if(!visible||restoring)return;
        var patches=new List<Patch>();var handles=new HashSet<IntPtr>();
        foreach(var e in entries)if(e.Window!=null&&!e.Window.IsDisposed){patches.Add(e.Window);handles.Add(e.Window.Handle);}
        if(patches.Count==0)return;
        IntPtr root=patches[0].DesktopRoot;if(root==IntPtr.Zero||!Native.IsWindow(root))return;
        int above=0;bool seenPatch=false,gap=false;
        EnumWindows(delegate(IntPtr h,IntPtr unused){
            if(h==root)return false;
            if(handles.Contains(h)){above++;seenPatch=true;}
            else if(seenPatch)gap=true;
            return true;
        },IntPtr.Zero);
        // Restored apps can split the overlay band while every patch is still above the desktop.
        bool restore=force||above!=patches.Count||gap;
        foreach(var patch in patches)if(!Native.IsWindowVisible(patch.Handle))restore=true;
        if(!restore)return;
        restoring=true;
        try
        {
            IntPtr after=Native.GetWindow(root,3);
            for(int i=0;i<patches.Count&&handles.Contains(after);i++)after=Native.GetWindow(after,3);
            if(after!=IntPtr.Zero&&(Native.GetWindowLong(after,-20)&8)!=0)after=IntPtr.Zero;
            IntPtr batch=BeginDeferWindowPos(patches.Count);
            foreach(var patch in patches)
            {
                if(batch==IntPtr.Zero)break;
                batch=DeferWindowPos(batch,patch.Handle,after,0,0,0,0,0x53); // no move/size/activate, show together
                after=patch.Handle;
            }
            if(batch==IntPtr.Zero||!EndDeferWindowPos(batch))foreach(var patch in patches)patch.RestorePlacement();
        }
        finally { restoring=false; }
    }

    public void Update(IntPtr parent, IList<Native.RECT> glyphs, uint[] colors, bool inspect)
    {
        if (parent != list) { Dispose(); list = parent; retry = DateTime.MinValue; }
        if (colors.Length == 0 || glyphs.Count != colors.Length) { Clear(); return; }
        try
        {
            if (view == null)
            {
                if (DateTime.UtcNow < retry) return;
                retry = DateTime.UtcNow.AddSeconds(5);
                view = DesktopView();
            }
            if (entries.Count != glyphs.Count)
            {
                Clear();
                for (int i = 0; i < glyphs.Count; i++) entries.Add(new Entry());
                inspect = true;
            }
            WatchPlacement();
            for (int i = 0; i < glyphs.Count; i++)
            {
                var e = entries[i];
                var r = glyphs[i];
                int size = Math.Min(r.Right - r.Left, r.Bottom - r.Top);
                if (inspect && size > 0 && size <= 512)
                {
                    IntPtr id;
                    view.Item(i, out id);
                    try
                    {
                        int len = (int)ILGetSize(id);
                        byte[] bytes = new byte[len]; Marshal.Copy(id, bytes, 0, len);
                        string key = size + ":" + Convert.ToBase64String(bytes);
                        if (e.Key != key || (!e.Pending && e.Window == null && DateTime.UtcNow >= e.Retry))
                        {
                            if (e.Window != null) e.Window.Dispose();
                            e.Window = null; e.Key = key;
                            QueueShape(e, key, parent, bytes, size);
                        }
                    }
                    finally { Marshal.FreeCoTaskMem(id); }
                }
                e.Bounds = new Rectangle((r.Right+r.Left-size)/2,r.Top,size,size);
                e.Color = colors[i];
                if (visible && e.Window != null && size > 0) e.Window.PaintAt(e.Bounds, colors[i]);
            }
        }
        catch (COMException ex)
        {
            if (!reported) { Log.Write("Desktop icon light: " + ex.Message); reported = true; }
            Dispose(); list = parent; retry = DateTime.UtcNow.AddSeconds(5);
        }
    }

    void QueueShape(Entry entry, string key, IntPtr parent, byte[] id, int size)
    {
        if (jobs == null)
        {
            var queue = jobs = new BlockingCollection<Action>();
            var worker = new Thread(delegate() {
                try { foreach (var job in queue.GetConsumingEnumerable()) if (!queue.IsAddingCompleted) job(); }
                finally { queue.Dispose(); }
            });
            worker.IsBackground = true;
            worker.SetApartmentState(ApartmentState.STA);
            worker.Start();
        }
        int generation = ++entry.Generation;
        entry.Pending = true;
        var ui = SynchronizationContext.Current;
        jobs.Add(delegate {
            Region shape = null;
            var pin = GCHandle.Alloc(id, GCHandleType.Pinned);
            try { shape = ReadShape(pin.AddrOfPinnedObject(), size); }
            catch (COMException) { }
            finally { pin.Free(); }
            ui.Post(delegate(object unused) {
                if (entry.Key != key || entry.Generation != generation || !Native.IsWindow(parent)) { if (shape != null) shape.Dispose(); return; }
                entry.Pending = false;
                entry.Retry = DateTime.UtcNow.AddMinutes(1);
                if (shape == null) return;
                entry.Window = new Patch(parent, shape);
                if (visible) entry.Window.PaintAt(entry.Bounds, entry.Color);
            }, null);
        });
    }

    static Region ReadShape(IntPtr id, int size)
    {
        Guid iid = typeof(ImageFactory).GUID;
        ImageFactory image;
        if (SHCreateItemFromIDList(id, ref iid, out image) < 0) return null;
        IntPtr bitmap = IntPtr.Zero;
        try
        {
            // Ask for the desktop item's cached thumbnail or icon, including virtual items.
            if (image.GetImage(new Size(size,size), 0x10, out bitmap) < 0 &&
                image.GetImage(new Size(size,size), 0, out bitmap) < 0) return null;
            BitmapHeader header;
            if (GetObject(bitmap, Marshal.SizeOf(typeof(BitmapHeader)), out header) == 0) return null;
            int w = header.Width, h = header.Height;
            if (w <= 0 || h <= 0 || w > 512 || h > 512) return null;
            var info = new BitmapInfo { Size = 40, Width = w, Height = -h, Planes = 1, Bits = 32 };
            var pixels = new byte[w*h*4];
            IntPtr dc = CreateCompatibleDC(IntPtr.Zero);
            try { if (GetDIBits(dc, bitmap, 0, (uint)h, pixels, ref info, 0) != h) return null; }
            finally { DeleteDC(dc); }
            using (var path = new GraphicsPath())
            {
                for (int y = 0; y < h; y++)
                {
                    int x = 0;
                    while (x < w)
                    {
                        int first = x;
                        while (x < w && pixels[(y*w+x)*4+3] >= 96) x++;
                        if (x > first) path.AddRectangle(new Rectangle((size-w)/2+first,(size-h)/2+y,x-first,1));
                        x++;
                    }
                }
                return path.PointCount == 0 ? null : new Region(path);
            }
        }
        finally { if (bitmap != IntPtr.Zero) DeleteObject(bitmap); Marshal.ReleaseComObject(image); }
    }

    static FolderView DesktopView()
    {
        var windows = (ShellWindows)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("9BA05972-F6A8-11CF-A442-00A0C90A8F39")));
        object location = 0, empty = null, desktop = null;
        Browser browser = null;
        try
        {
            int hwnd;
            desktop = windows.FindWindowSW(ref location, ref empty, 8, out hwnd, 1);
            if (desktop == null) throw new COMException("Desktop view unavailable");
            Guid sid = new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837"), iid = typeof(Browser).GUID;
            ((Services)desktop).QueryService(ref sid, ref iid, out browser);
            object active; browser.QueryActiveShellView(out active);
            return (FolderView)active;
        }
        finally
        {
            if (browser != null) Marshal.ReleaseComObject(browser);
            if (desktop != null) Marshal.ReleaseComObject(desktop);
            Marshal.ReleaseComObject(windows);
        }
    }

    [ComImport, Guid("85CB6900-4D95-11CF-960C-0080C7F4EE85"), InterfaceType(ComInterfaceType.InterfaceIsDual)]
    interface ShellWindows
    {
        void Count(); void Item(); void NewEnum(); void Register(); void RegisterPending();
        void Revoke(); void OnNavigate(); void OnActivated();
        [return:MarshalAs(UnmanagedType.IDispatch)] object FindWindowSW(ref object location,ref object root,int cls,out int hwnd,int options);
    }
    [ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface Services { void QueryService(ref Guid service,ref Guid iid,out Browser browser); }
    [ComImport, Guid("000214E2-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface Browser
    {
        void GetWindow(); void ContextHelp(); void InsertMenus(); void SetMenu(); void RemoveMenus();
        void SetStatus(); void EnableModeless(); void Translate(); void Browse(); void ViewState();
        void ControlWindow(); void SendControl();
        void QueryActiveShellView([MarshalAs(UnmanagedType.IUnknown)] out object view);
    }
    [ComImport, Guid("CDE725B0-CCC9-4519-917E-325D72FAB4CE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface FolderView { void GetMode(); void SetMode(); void GetFolder(); void Item(int index,out IntPtr child); }
    [ComImport, Guid("BCC18B79-BA16-442F-80C4-8A59C30C463B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface ImageFactory { [PreserveSig] int GetImage(Size size,uint flags,out IntPtr bitmap); }
    [StructLayout(LayoutKind.Sequential)] struct BitmapHeader { public int Type,Width,Height,Stride; public ushort Planes,Bits; public IntPtr Data; }
    [StructLayout(LayoutKind.Sequential)] struct BitmapInfo { public int Size,Width,Height; public ushort Planes,Bits; public int Compression,ImageSize,Xppm,Yppm,Used,Important; }
    [DllImport("shell32.dll")] static extern uint ILGetSize(IntPtr id);
    [DllImport("shell32.dll")] static extern int SHCreateItemFromIDList(IntPtr id,ref Guid iid,out ImageFactory image);
    [DllImport("gdi32.dll",EntryPoint="GetObjectW")] static extern int GetObject(IntPtr obj,int size,out BitmapHeader bitmap);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr other);
    [DllImport("gdi32.dll")] static extern int GetDIBits(IntPtr dc,IntPtr bitmap,uint start,uint rows,byte[] pixels,ref BitmapInfo info,uint usage);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc,IntPtr obj);
    [DllImport("gdi32.dll")] static extern IntPtr CreateDIBSection(IntPtr dc,ref BitmapInfo info,uint usage,out IntPtr bits,IntPtr section,uint offset);
    [StructLayout(LayoutKind.Sequential,Pack=1)] struct Blend { public byte Operation,Flags,Alpha,Format; }
    [DllImport("user32.dll",SetLastError=true)] static extern bool UpdateLayeredWindow(IntPtr h,IntPtr destination,ref Native.POINT at,ref Size size,IntPtr source,ref Native.POINT origin,uint key,ref Blend blend,uint flags);
    delegate void WinEventProc(IntPtr hook,uint ev,IntPtr hwnd,int objectId,int childId,uint thread,uint time);
    delegate bool EnumWindowProc(IntPtr h,IntPtr unused);
    [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint first,uint last,IntPtr module,WinEventProc callback,uint process,uint thread,uint flags);
    [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowProc callback,IntPtr unused);
    [DllImport("user32.dll")] static extern IntPtr BeginDeferWindowPos(int count);
    [DllImport("user32.dll")] static extern IntPtr DeferWindowPos(IntPtr batch,IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
    [DllImport("user32.dll")] static extern bool EndDeferWindowPos(IntPtr batch);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint process);
}
