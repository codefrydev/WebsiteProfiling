FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Shared/WebsiteProfiling.Hosting/WebsiteProfiling.Hosting.csproj Shared/WebsiteProfiling.Hosting/
COPY Shared/WebsiteProfiling.Contracts/WebsiteProfiling.Contracts.csproj Shared/WebsiteProfiling.Contracts/
COPY Shared/WebsiteProfiling.Data/WebsiteProfiling.Data.csproj Shared/WebsiteProfiling.Data/
COPY Shared/WebsiteProfiling.Data.EntityFrameworkCore/WebsiteProfiling.Data.EntityFrameworkCore.csproj Shared/WebsiteProfiling.Data.EntityFrameworkCore/
COPY AiService/src/AiService.Domain/AiService.Domain.csproj AiService/src/AiService.Domain/
COPY AiService/src/AiService.Providers/AiService.Providers.csproj AiService/src/AiService.Providers/
COPY AiService/src/AiService.Tools/AiService.Tools.csproj AiService/src/AiService.Tools/
COPY AiService/src/AiService.Application/AiService.Application.csproj AiService/src/AiService.Application/
COPY AiService/src/AiService.Mcp/AiService.Mcp.csproj AiService/src/AiService.Mcp/
COPY AiService/src/AiService.Api/AiService.Api.csproj AiService/src/AiService.Api/
RUN dotnet restore AiService/src/AiService.Api/AiService.Api.csproj
COPY Shared/WebsiteProfiling.Hosting/ Shared/WebsiteProfiling.Hosting/
COPY Shared/WebsiteProfiling.Contracts/ Shared/WebsiteProfiling.Contracts/
COPY Shared/WebsiteProfiling.Data/ Shared/WebsiteProfiling.Data/
COPY Shared/WebsiteProfiling.Data.EntityFrameworkCore/ Shared/WebsiteProfiling.Data.EntityFrameworkCore/
COPY AiService/src/ AiService/src/
RUN dotnet publish AiService/src/AiService.Api/AiService.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
# curl is used by the compose healthcheck; libgssapi-krb5-2 silences Npgsql's harmless
# GSSAPI probe warning on connect. Neither ships in the aspnet image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*
ENV ASPNETCORE_URLS=http://+:8092
EXPOSE 8092
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "AiService.Api.dll"]
