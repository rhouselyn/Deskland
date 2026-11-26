using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

// 主题清单（prototype/themes.json）：页面映射与产品权限共用同一份清单。
// 未标 product 的 ready 主题默认拒绝，避免新增付费主题被意外免费开放。
static class Themes
{
    static Dictionary<string, object> Find(string pageDir, string id)
    {
        if (id == null) return null;
        try
        {
            var root = Json.Parse(File.ReadAllText(Path.Combine(pageDir, "themes.json"), Encoding.UTF8)) as Dictionary<string, object>;
            if (root == null) return null;
            foreach (object o in (System.Collections.IEnumerable)root["themes"])
            {
                var theme = o as Dictionary<string, object>;
                if (theme != null && (theme["id"] as string) == id &&
                    theme.ContainsKey("status") && (theme["status"] as string) == "ready")
                    return theme;
            }
        }
        catch (Exception ex) { Log.Write("读取 themes.json 失败：" + ex.Message); }
        return null;
    }

    public static string PageFor(string pageDir, string id)
    {
        var theme = Find(pageDir, id);
        return theme == null ? null : theme["page"] as string;
    }

    public static Dictionary<string, object> DefaultsFor(string pageDir, string id)
    {
        var result = new Dictionary<string, object>();
        var theme = Find(pageDir, id);
        if (theme == null) return result;
        object value;
        if (theme.TryGetValue("defaults", out value) && value is Dictionary<string, object>)
            foreach (var pair in (Dictionary<string, object>)value) result[pair.Key] = pair.Value;
        if (theme.ContainsKey("adaptive") && Equals(theme["adaptive"], true)) result["adaptive"] = 1;
        if (theme.TryGetValue("groups", out value))
            foreach (Dictionary<string, object> group in (System.Collections.IEnumerable)value)
                foreach (Dictionary<string, object> param in (System.Collections.IEnumerable)group["params"])
                    result[(string)param["key"]] = param["default"];
        return result;
    }

    public static string ProductFor(string pageDir, string id)
    {
        var theme = Find(pageDir, id);
        object product;
        return theme != null && theme.TryGetValue("product", out product) ? product as string : null;
    }

    public static bool Allowed(string pageDir, string id, Func<string, bool> owns)
    {
        if (PageFor(pageDir, id) == null) return false;
        string product = ProductFor(pageDir, id);
        if (product == "free") return true;
        return product != null && owns != null && owns(product);
    }
}
