FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY services/Shared/WebsiteProfiling.Shared/WebsiteProfiling.Shared.csproj services/Shared/WebsiteProfiling.Shared/
COPY services/Bff/src/Bff.Api/Bff.Api.csproj services/Bff/src/Bff.Api/
RUN dotnet restore services/Bff/src/Bff.Api/Bff.Api.csproj
COPY services/Shared/WebsiteProfiling.Shared/ services/Shared/WebsiteProfiling.Shared/
COPY services/Bff/src/ services/Bff/src/
RUN dotnet publish services/Bff/src/Bff.Api/Bff.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8090
EXPOSE 8090
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Bff.Api.dll"]
