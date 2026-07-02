using System;

namespace Schema.Model.Entities;

public partial class LhAuditItem
{
    public long Id { get; set; }

    public long AuditRowId { get; set; }

    public int ItemIndex { get; set; }

    public string RowData { get; set; } = null!;
}
