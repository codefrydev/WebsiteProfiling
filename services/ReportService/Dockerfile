FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Shared/WebsiteProfiling.Contracts/WebsiteProfiling.Contracts.csproj Shared/WebsiteProfiling.Contracts/
COPY ReportService/ReportService.slnx ReportService/
COPY ReportService/src/ReportService.Domain/ReportService.Domain.csproj ReportService/src/ReportService.Domain/
COPY ReportService/src/ReportService.Application/ReportService.Application.csproj ReportService/src/ReportService.Application/
COPY ReportService/src/ReportService.Api/ReportService.Api.csproj ReportService/src/ReportService.Api/
RUN dotnet restore ReportService/src/ReportService.Api/ReportService.Api.csproj
COPY Shared/WebsiteProfiling.Contracts/ Shared/WebsiteProfiling.Contracts/
COPY ReportService/src/ ReportService/src/
RUN dotnet publish ReportService/src/ReportService.Api/ReportService.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
ENV ASPNETCORE_URLS=http://+:8094
EXPOSE 8094
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "ReportService.Api.dll"]
