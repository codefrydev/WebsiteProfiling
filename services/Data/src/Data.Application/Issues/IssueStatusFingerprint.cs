using System.Security.Cryptography;
using System.Text;

namespace Data.Application.Issues;

/// <summary>
/// Port of <c>issue_status_store.issue_fingerprint</c>.
/// </summary>
public static class IssueStatusFingerprint
{
    public static string Compute(string message, string url, string? categoryId)
    {
        var raw = $"{categoryId ?? string.Empty}|{url ?? string.Empty}|{message ?? string.Empty}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(hash).ToLowerInvariant()[..32];
    }
}
