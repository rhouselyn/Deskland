using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// ExplorerTAP handles the Windows 11 XAML background; classic taskbars use accent policy.
sealed class DesktopTaskbar : IDisposable
{
    readonly AutoResetEvent changed = new AutoResetEvent(false);
    volatile bool enabled, stopping;
    Thread worker;
    public string Error;

    public void SetEnabled(bool value)
    {
        if (enabled == value) return;
        enabled = value;
        if (worker == null && value)
        {
            worker = new Thread(Run);
            worker.IsBackground = true;
            worker.SetApartmentState(ApartmentState.MTA);
            worker.Start();
        }
        changed.Set();
    }

    void Run()
    {
        CoInitializeEx(IntPtr.Zero, 0);
        ITaskbarAppearanceService service = null;
        var classic = new HashSet<IntPtr>();
        uint explorer = 0;
        try
        {
            while (!stopping)
            {
                try
                {
                    if (!enabled)
                    {
                        Restore(ref service, classic);
                        explorer = 0;
                    }
                    else
                    {
                        IntPtr main = FindWindow("Shell_TrayWnd", null);
                        uint pid;
                        GetWindowThreadProcessId(main, out pid);
                        if (main != IntPtr.Zero)
                        {
                            if (pid != explorer)
                            {
                                Restore(ref service, classic);
                                bool xaml = false;
                                EnumChildWindows(main, delegate(IntPtr h, IntPtr p) {
                                    var name = new StringBuilder(128);
                                    GetClassName(h, name, name.Capacity);
                                    if (name.ToString() == "Windows.UI.Composition.DesktopWindowContentBridge") xaml = true;
                                    return true;
                                }, IntPtr.Zero);
                                if (xaml)
                                {
                                    Guid iid = typeof(ITaskbarAppearanceService).GUID;
                                    Marshal.ThrowExceptionForHR(InjectExplorerTAP(main, ref iid, out service));
                                    // Register recovery before changing anything, including if the host crashes.
                                    service.RestoreAllTaskbarsToDefaultWhenProcessDies((uint)Process.GetCurrentProcess().Id);
                                }
                                explorer = pid;
                            }
                            if (enabled && !stopping)
                                EnumWindows(delegate(IntPtr h, IntPtr p) {
                                    var name = new StringBuilder(128);
                                    GetClassName(h, name, name.Capacity);
                                    if (name.ToString() == "Shell_TrayWnd" || name.ToString() == "Shell_SecondaryTrayWnd")
                                    {
                                        if (service != null)
                                        {
                                            service.SetTaskbarAppearance(h, 1, 0); // SolidColor, alpha zero
                                            service.SetTaskbarBorderVisibility(h, false);
                                        }
                                        else
                                        {
                                            SetAccent(h, 2);
                                            classic.Add(h);
                                        }
                                    }
                                    return true;
                                }, IntPtr.Zero);
                        }
                    }
                }
                catch (Exception ex)
                {
                    enabled = false;
                    Restore(ref service, classic);
                    explorer = 0;
                    Interlocked.Exchange(ref Error, ex.Message);
                    Log.Write("透明任务栏：" + ex);
                }
                changed.WaitOne(enabled ? 1000 : Timeout.Infinite);
            }
        }
        finally { Restore(ref service, classic); CoUninitialize(); }
    }

    static void Restore(ref ITaskbarAppearanceService service, HashSet<IntPtr> classic)
    {
        if (service != null)
        {
            try { service.RestoreAllTaskbarsToDefault(); }
            catch (COMException) { } // Explorer may have restarted.
            Marshal.ReleaseComObject(service);
            service = null;
        }
        foreach (IntPtr h in classic)
        {
            try { SetAccent(h, 0); }
            catch (Exception ex) { Log.Write("恢复任务栏：" + ex.Message); }
            IntPtr result;
            SendMessageTimeout(h, 0x031E, new IntPtr(1), IntPtr.Zero, 2, 200, out result);
        }
        classic.Clear();
    }

    public void Dispose()
    {
        enabled = false;
        stopping = true;
        changed.Set();
        // Injection can take 35 seconds. The helper also restores when this process dies.
        if (worker == null || worker.Join(1500)) changed.Dispose();
    }

    static void SetAccent(IntPtr window, int state)
    {
        var policy = new AccentPolicy { State = state, Flags = 2 };
        IntPtr ptr = Marshal.AllocHGlobal(Marshal.SizeOf(policy));
        try
        {
            Marshal.StructureToPtr(policy, ptr, false);
            var data = new CompositionData { Attribute = 19, Data = ptr, Size = new IntPtr(Marshal.SizeOf(policy)) };
            if (!SetWindowCompositionAttribute(window, ref data)) throw new InvalidOperationException("Taskbar accent policy failed");
        }
        finally { Marshal.FreeHGlobal(ptr); }
    }

    [StructLayout(LayoutKind.Sequential)] struct AccentPolicy { public int State, Flags, Color, Animation; }
    [StructLayout(LayoutKind.Sequential)] struct CompositionData { public int Attribute; public IntPtr Data, Size; }
    delegate bool EnumWindowProc(IntPtr h, IntPtr p);
    [DllImport("ole32.dll")] static extern int CoInitializeEx(IntPtr p, uint mode);
    [DllImport("ole32.dll")] static extern void CoUninitialize();
    [DllImport("ExplorerTAP-2026.2.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int InjectExplorerTAP(IntPtr window, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out ITaskbarAppearanceService service);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string name, string title);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowProc callback, IntPtr p);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumWindowProc callback, IntPtr p);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder name, int size);
    [DllImport("user32.dll")] static extern bool SetWindowCompositionAttribute(IntPtr h, ref CompositionData data);
    [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);

    // Vtable order follows ExplorerTAP/ITaskbarAppearanceService.idl, release 2026.2.
    [ComImport, Guid("5bcf9150-c28a-4ef2-913c-4c3ea2f5ead0"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface ITaskbarAppearanceService
    {
        void SetTaskbarAppearance(IntPtr taskbar, int brush, uint color);
        void SetTaskbarBlur(IntPtr taskbar, uint color, float amount);
        void ReturnTaskbarToDefaultAppearance(IntPtr taskbar);
        void SetTaskbarBorderVisibility(IntPtr taskbar, [MarshalAs(UnmanagedType.Bool)] bool visible);
        void RestoreAllTaskbarsToDefault();
        void RestoreAllTaskbarsToDefaultWhenProcessDies(uint pid);
        void KillExplorerWhenPackageUninstalls([MarshalAs(UnmanagedType.LPWStr)] string package);
    }
}
