using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using ReportService.Application.Repositories;
using WeCantSpell.Hunspell;

namespace ReportService.Application.Build;

/// <summary>Optional Hunspell spell checker for optional audits (mirrors pyspellchecker path).</summary>
internal static class SpellCheckerFactory
{
    private static WordList? _cached;
    private static string? _skipReason;

    public static (WordList? Checker, string? SkipReason) GetOrCreate(
        ILogger? logger = null,
        string[]? candidatesOverride = null)
    {
        if (candidatesOverride is null)
        {
            if (_cached is not null)
            {
                return (_cached, null);
            }

            if (_skipReason is not null)
            {
                return (null, _skipReason);
            }
        }

        var candidates = candidatesOverride ?? new[]
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
                var wordList = WordList.CreateFromFiles(dicPath, affPath);
                if (candidatesOverride is null)
                {
                    _cached = wordList;
                }
                return (wordList, null);
            }
            catch (Exception ex)
            {
                logger?.LogDebug(ex, "Failed to load Hunspell dictionary from {DicPath}", dicPath);
            }
        }

        const string missing = "Hunspell dictionary not installed";
        if (candidatesOverride is null)
        {
            _skipReason = missing;
        }
        return (null, missing);
    }
}
