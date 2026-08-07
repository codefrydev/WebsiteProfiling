using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Schema.Model.Migrations
{
    /// <inheritdoc />
    public partial class AddPipelineSelectorColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "boilerplate_selectors",
                table: "crawl_settings",
                type: "text",
                nullable: false,
                defaultValueSql: "''::text");

            migrationBuilder.AddColumn<string>(
                name: "main_content_selectors",
                table: "crawl_settings",
                type: "text",
                nullable: false,
                defaultValueSql: "''::text");

            migrationBuilder.AddColumn<string>(
                name: "pipeline_graph_json",
                table: "crawl_settings",
                type: "text",
                nullable: false,
                defaultValueSql: "''::text");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "boilerplate_selectors",
                table: "crawl_settings");

            migrationBuilder.DropColumn(
                name: "main_content_selectors",
                table: "crawl_settings");

            migrationBuilder.DropColumn(
                name: "pipeline_graph_json",
                table: "crawl_settings");
        }
    }
}
