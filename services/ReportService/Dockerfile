FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY services/Shared/WebsiteProfiling.Contracts/WebsiteProfiling.Contracts.csproj services/Shared/WebsiteProfiling.Contracts/
COPY services/Shared/WebsiteProfiling.TypedConfig/WebsiteProfiling.TypedConfig.csproj services/Shared/WebsiteProfiling.TypedConfig/
COPY services/ReportService/src/ReportService.Domain/ReportService.Domain.csproj services/ReportService/src/ReportService.Domain/
COPY services/ReportService/src/ReportService.Application/ReportService.Application.csproj services/ReportService/src/ReportService.Application/
COPY services/ReportService/src/ReportService.Api/ReportService.Api.csproj services/ReportService/src/ReportService.Api/
RUN dotnet restore services/ReportService/src/ReportService.Api/ReportService.Api.csproj
COPY services/Shared/WebsiteProfiling.Contracts/ services/Shared/WebsiteProfiling.Contracts/
COPY services/Shared/WebsiteProfiling.TypedConfig/ services/Shared/WebsiteProfiling.TypedConfig/
COPY config/typed_config_manifest.json config/typed_config_manifest.json
COPY services/ReportService/src/ services/ReportService/src/
RUN dotnet publish services/ReportService/src/ReportService.Api/ReportService.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
ENV ASPNETCORE_URLS=http://+:8094
EXPOSE 8094
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "ReportService.Api.dll"]
