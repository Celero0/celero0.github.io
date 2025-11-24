 
+++ 
draft = false
date = 2025-11-24T18:35:18Z
title = "Popcorn Machine - HackTheBox"
description = "Esta es una máquina de Hackthebox de nivel fácil."
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-----------------------------
- Tags: #Linux #Easy
----------------
# Enumeración Nmap
**Comando:**
```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.10.10.6 -oG allPorts
```

En el escaneo encontramos dos puertos abiertos, el puerto 22 que corre el servicio SSH, el cual por su versión 5.1p1 es vulnerable a `UserEnumeration`. Además del servicio HTTP que corre por el puerto 80, donde nos muestra el nombre de dominio `popcorn.htb`
<img src="/images/Pasted image 20251031205654.png" style="width:100%; height:auto; display:block; margin:auto;">

Por lo tanto, procederemos a agregar el dominio `popcorn.htb` a nuestro `/etc/hosts`
<img src="/images/Pasted image 20251031210718.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración HTTP puerto 80

Entrando en el dominio `popcorn.htb` encontramos una página estatica
<img src="/images/Pasted image 20251031213420.png" style="width:100%; height:auto; display:block; margin:auto;">

Utilizando `fuzz` de la siguiente manera
```bash
ffuf -u http://popcorn.htb/FUZZ -w /usr/share/seclists/Discovery/Web-Content/directory-list-2.3-medium.txt -t 100 -fs 177
```

Encontramos los siguientes 3 directorios:
<img src="/images/Pasted image 20251031213541.png" style="width:100%; height:auto; display:block; margin:auto;">

En el directorio `test`, encontramos una página de `PHP 5.2.10` por defecto
<img src="/images/Pasted image 20251031213650.png" style="width:100%; height:auto; display:block; margin:auto;">

En el directorio `torrent` encontramos la página de #TorrentHoster
<img src="/images/Pasted image 20251031213720.png" style="width:100%; height:auto; display:block; margin:auto;">

Y en el directiorio `rename` nos encontramos con el siguiente mensaje
`Renamer API Syntax: index.php?filename=old_file_path_an_name&newfilename=new_file_path_and_name`

El cual parece ser un script en PHP que permite cambiar el nombre de un archivo proporcionando la ruta absoluta del archivo.
<img src="/images/Pasted image 20251031213803.png" style="width:100%; height:auto; display:block; margin:auto;">

## Enumeración de TorrentHoster

En la página de TorrentHoster nos permite loguearnos o registrarnos, como no tenemos credenciales procederemos a registrarnos con `rkx:rkx`
<img src="/images/Pasted image 20251031214030.png" style="width:100%; height:auto; display:block; margin:auto;">

Al loguearnos con nuestra cuenta registrada, vemos el inciso de upload `http://popcorn.htb/torrent/torrents.php?mode=upload` que nos permite subir algún archivo torrent
<img src="/images/Pasted image 20251031214146.png" style="width:100%; height:auto; display:block; margin:auto;">

Buscamos en la web un archivo .torrent de ejemplo y lo descargamos
<img src="/images/Pasted image 20251031220034.png" style="width:100%; height:auto; display:block; margin:auto;">

# Subida archivo maliciosa

Con el archivo de ejemplo subimos el .torrent
<img src="/images/Pasted image 20251031220134.png" style="width:100%; height:auto; display:block; margin:auto;">

Y Vemos que nos permite subir una imagen en nuestro archivo
<img src="/images/Pasted image 20251031220628.png" style="width:100%; height:auto; display:block; margin:auto;">

Pasando el click por encima de la imagen vemos la ruta `popcorn.htb/torrent/upload/noss.png`, por tanto subiremos un archivo .png con una reverseshell en php, para posteriormente con la utilidad  `rename` renombrar la extensión a .php y ser interpretado el codigo

<img src="/images/Pasted image 20251031220910.png" style="width:100%; height:auto; display:block; margin:auto;">

Vamos a subir el archivo `reverse.png`
<img src="/images/Pasted image 20251031220938.png" style="width:100%; height:auto; display:block; margin:auto;">
y nos muestra que se subió exitosamente
<img src="/images/Pasted image 20251031220953.png" style="width:100%; height:auto; display:block; margin:auto;">

El archivo al subirse se le cambio el nombre, pero podemos verlo
<img src="/images/Pasted image 20251031222335.png" style="width:100%; height:auto; display:block; margin:auto;">
su nombre es `d0d14c926e6e99761a2fdcff27b403d96376eff6.png`

Ahora vamos a la ruta `popcorn.htb/rename/` y vemos que la API se utiliza con `index.php?filename=nombre del archivo viejo&newfilename=nombre del archivo nuevo`

Como no sabemos la ruta absoluta de donde se alberga el torrent podemos intentar adivinarla, pero no es necesario, ya que al poner cualquier valor vemos un mensaje de error mostrandonos la ruta de la aplicación siendo `/var/www/rename/index.php`

Por lo tanto podemos hacer la estructura por detrás de la web

<img src="/images/Pasted image 20251031222420.png" style="width:100%; height:auto; display:block; margin:auto;">

Nuestra reverse shell se encuentra en la ruta `/var/www/torrent/upload/d0d14c926e6e99761a2fdcff27b403d96376eff6.png`, por tanto para cambiarle el nombre, y que sea interpretado el código debemos hacer lo siguiente
```bash
http://popcorn.htb/rename/index.php?filename=/var/www/torrent/upload/d0d14c926e6e99761a2fdcff27b403d96376eff6.png&newfilename=/var/www/torrent/upload/reverse.php
```

y obtenemos un OK!, por tanto podemos suponer que el cambio de nombre resultó exitoso
<img src="/images/Pasted image 20251031222540.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora nos pondremos en escucha por el puerto 4443 con `nc`

```bash
nc -nlvp 4443
```
<img src="/images/Pasted image 20251031222622.png" style="width:100%; height:auto; display:block; margin:auto;">

Y hacemos un curl a `http://popcorn.htb/torrent/upload/reverse.php`, y obtenemos la shell
<img src="/images/Pasted image 20251031223055.png" style="width:100%; height:auto; display:block; margin:auto;">

# Escalada de privilegios

Para escalar privilegios primero vemos la versión del kernel, con el comando `uname`

```bash
uname -r
```
Tenemos que la versión del kernel es `2.6.31-14`
<img src="/images/Pasted image 20251031225646.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto buscamos por vulnerabilidades a esa versión y encontramos el dirtycow
<img src="/images/Pasted image 20251031225730.png" style="width:100%; height:auto; display:block; margin:auto;">

#Dirtycow

El dirty cow es una vulnerabilidad de kernel que afecta a `Linux Kernel 2.6.22 < 3.9`, la vulnerabilidad edita el archivo `/etc/passwd` agregando un usuario en este caso `firefart` con privilegios root

<img src="/images/Pasted image 20251031225940.png" style="width:100%; height:auto; display:block; margin:auto;">

Copiamos todo el script y creamos el archivo dirtycow.c, el archivo se compila de la siguiente forma 
```bash
gcc -pthread dirtycow.c -o dirty -lcrypt
````

Una vez compilado tenemos el archivo `dirty`
<img src="/images/Pasted image 20251031230142.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora si corremos el archivo con  `./dirty`, nos pedirá escribir una contraseña. Deberemos escribir una contraseña robusta y hacemos `su firefart`
obteniendo permisos `root` y la flag `/root/root.txt`
<img src="/images/Pasted image 20251031230517.png" style="width:100%; height:auto; display:block; margin:auto;">
