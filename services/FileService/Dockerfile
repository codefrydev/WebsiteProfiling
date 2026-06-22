FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY FileService.slnx ./
COPY src/FileService.Domain/FileService.Domain.csproj src/FileService.Domain/
COPY src/FileService.Rendering/FileService.Rendering.csproj src/FileService.Rendering/
COPY src/FileService.Application/FileService.Application.csproj src/FileService.Application/
COPY src/FileService.Api/FileService.Api.csproj src/FileService.Api/
RUN dotnet restore src/FileService.Api/FileService.Api.csproj
COPY src/ src/
RUN dotnet publish src/FileService.Api/FileService.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "FileService.Api.dll"]
