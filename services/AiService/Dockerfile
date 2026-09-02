FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Shared/WebsiteProfiling.Shared/WebsiteProfiling.Shared.csproj Shared/WebsiteProfiling.Shared/
COPY AiService/src/AiService.Api/AiService.Api.csproj AiService/src/AiService.Api/
RUN dotnet restore AiService/src/AiService.Api/AiService.Api.csproj
COPY Shared/WebsiteProfiling.Shared/ Shared/WebsiteProfiling.Shared/
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
