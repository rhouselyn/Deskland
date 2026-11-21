using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;

// 固定的本机存档路径；页面不能选择读写文件。旧存档保留为备份。
static class PastoralStore
{
    static string PathName { get { return Path.Combine(Log.DataDir, "pastoral-world.json"); } }
    public static bool Valid(string raw)
    {
        if (raw == null || raw.Length > 196608) return false;
        try
        {
            var d = Json.Parse(raw) as Dictionary<string, object>;
            if (d == null || !d.ContainsKey("version") || Convert.ToInt32(d["version"]) != 1) return false;
            foreach (string key in new[] { "homes", "agents", "torches" })
            {
                object value;
                if (!d.TryGetValue(key, out value)) return false;
                var items = value as ICollection;
                if (items == null || items.Count > (key == "agents" ? 32 : key == "homes" ? 3 : 8)) return false;
            }
            return true;
        }
        catch { return false; }
    }
    public static string Load()
    {
        foreach (string path in new[] { PathName, PathName + ".bak" })
            try { if (File.Exists(path)) { string raw = File.ReadAllText(path, Encoding.UTF8); if (Valid(raw)) return raw; } }
            catch (Exception ex) { Log.Write("读取草原存档失败：" + ex.Message); }
        return null;
    }
    public static void Save(string raw)
    {
        if (!Valid(raw)) return;
        try
        {
            Directory.CreateDirectory(Log.DataDir);
            string temp = PathName + ".tmp";
            File.WriteAllText(temp, raw, new UTF8Encoding(false));
            if (File.Exists(PathName)) File.Replace(temp, PathName, PathName + ".bak");
            else File.Move(temp, PathName);
        }
        catch (Exception ex) { Log.Write("保存草原存档失败：" + ex.Message); }
    }
}
