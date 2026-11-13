terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {
  host = "npipe:////.//pipe//docker_engine"
}

resource "docker_image" "nginx" {
  name = "nginx:alpine"
}

resource "docker_container" "hello" {
  name  = "tf-hello"
  image = docker_image.nginx.image_id

  ports {
    internal = 80
    external = 8080
  }
}