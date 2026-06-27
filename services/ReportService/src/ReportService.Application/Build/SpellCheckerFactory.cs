using System.Text.Json;
using System.Text.RegularExpressions;
using ReportService.Application.Repositories;
using WeCantSpell.Hunspell;

namespace ReportService.Application.Build;

/// <summary>Optional Hunspell spell checker for optional audits (mirrors pyspellchecker path).</summary>
internal static class SpellCheckerFactory
{
    private static WordList? _cached;
    private static string? _skipReason;

    public static (WordList? Checker, string? SkipReason) GetOrCreate()
    {
        if (_cached is not null)
        {
            return (_cached, null);
        }

        if (_skipReason is not null)
        {
            return (null, _skipReason);
        }

        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "Dictionaries", "en_US"),
            "/usr/share/hunspell/en_US",
            "/usr/local/share/hunspell/en_US",
            "/opt/homebrew/share/hunspell/en_US",
        };

        foreach (var basePath in candidates)
        {
            var dicPath = basePath + ".dic";
            var affPath = basePath + ".aff";
            if (!File.Exists(dicPath) || !File.Exists(affPath))
            {
                continue;
            }

            try
            {
                _cached = WordList.CreateFromFiles(dicPath, affPath);
                return (_cached, null);
            }
            catch (Exception)
            {
                // try next path
            }
        }

        _skipReason = "Hunspell dictionary not installed";
        return (null, _skipReason);
    }
}
