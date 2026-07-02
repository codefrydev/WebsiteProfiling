using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Schema.Model.Migrations
{
    /// <inheritdoc />
    public partial class AddPipelineJobsSingleActiveIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "single_active_slot",
                table: "pipeline_jobs",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateIndex(
                name: "idx_pipeline_jobs_single_active",
                table: "pipeline_jobs",
                column: "single_active_slot",
                unique: true,
                filter: "status IN ('pending', 'running')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "idx_pipeline_jobs_single_active",
                table: "pipeline_jobs");

            migrationBuilder.DropColumn(
                name: "single_active_slot",
                table: "pipeline_jobs");
        }
    }
}
