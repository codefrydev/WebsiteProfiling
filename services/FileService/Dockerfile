FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Shared/WebsiteProfiling.Contracts/WebsiteProfiling.Contracts.csproj Shared/WebsiteProfiling.Contracts/
COPY FileService/src/FileService.Domain/FileService.Domain.csproj FileService/src/FileService.Domain/
COPY FileService/src/FileService.Rendering/FileService.Rendering.csproj FileService/src/FileService.Rendering/
COPY FileService/src/FileService.Application/FileService.Application.csproj FileService/src/FileService.Application/
COPY FileService/src/FileService.Api/FileService.Api.csproj FileService/src/FileService.Api/
RUN dotnet restore FileService/src/FileService.Api/FileService.Api.csproj
COPY Shared/WebsiteProfiling.Contracts/ Shared/WebsiteProfiling.Contracts/
COPY FileService/src/ FileService/src/
RUN dotnet publish FileService/src/FileService.Api/FileService.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "FileService.Api.dll"]
