+++ 
draft = false
date = 2025-11-25T23:28:19Z
title = "Bank Machine - HackTheBox"
description = "Esta es una máquina Linux de nivel fácil de la plataforma HackTheBox"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-----------------------------
- Tags: #Machine #Linux #Easy #OpenRedirect #DNSleakInformation #ffuf #fuzz #curl #WEB #Port80 
----------------
# Enumeración Nmap
**Comando:**
```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.10.11.35 -oG allPorts
```
<img src="/images/Pasted image 20250327224124.png" style="width:100%; height:auto; display:block; margin:auto;">
Como trabajamos con HackTheBox, asumiremos el dominio bank.htb

Agregándolo en nuestro /etc/hosts
<img src="/images/Pasted image 20250327224258.png" style="width:100%; height:auto; display:block; margin:auto;">
Luego como tenemos el puerto 53 asociado a DNS
<img src="/images/Pasted image 20250327224406.png" style="width:100%; height:auto; display:block; margin:auto;">
utilizamos el siguiente comando para recopilar información de demás servidores
**Comando:**
```bash
dig any @10.10.10.29 bank.htb
```
Teniendo como respuesta un posible subdominio "chris.bank.htb" en la siguiente sección:
<img src="/images/Pasted image 20250327224712.png" style="width:100%; height:auto; display:block; margin:auto;">
Lo agregamos a nuestro /etc/hosts
<img src="/images/Pasted image 20250327224812.png" style="width:100%; height:auto; display:block; margin:auto;">
# Enumeración puerto HTTP 80
en http://chris.bank.htb tenemos una página de apache por default
<img src="/images/Pasted image 20250327225020.png" style="width:100%; height:auto; display:block; margin:auto;">Mientras en http://bank.htb solamente tenemos un login
<img src="/images/Pasted image 20250327225051.png" style="width:100%; height:auto; display:block; margin:auto;">
# Opción 1 (Open Redirect):
#OpenRedirect 
Al entrar a http://bank.htb nos lleva al login, siendo un login.php
<img src="/images/Pasted image 20250327230023.png" style="width:100%; height:auto; display:block; margin:auto;">
Por tanto fuzzeamos la página buscando archivos .php
**Comando:**
```bash
ffuf -u http://bank.htb/FUZZ.php -w /usr/share/wordlists/seclists/Discovery/Web-Content/directory-list-2.3-medium.txt -fs 7322 -t 120
```
Descubrimos 3 archivos disponibles (recordar que son archivos php), teniendo la ruta support con el código de estado 302, posible redirect
<img src="/images/Pasted image 20250327230304.png" style="width:100%; height:auto; display:block; margin:auto;">
por tanto intentamos acceder a la ruta http://bank.htb/support.php
y nos redirige a la página de login
<img src="/images/Pasted image 20250327230522.png" style="width:100%; height:auto; display:block; margin:auto;">

Para evitar el redirect utilizaremos burpsuite de la siguiente manera
<img src="/images/Pasted image 20250327231451.png" style="width:100%; height:auto; display:block; margin:auto;">
Cambiamos 302 Found por 200 OK en Response header

Ahora vamos a http://bank.htb/support.php
y se realiza con éxito el Open Redirect
<img src="/images/Pasted image 20250327231607.png" style="width:100%; height:auto; display:block; margin:auto;">

# Opción 2:

Comenzamos el fuzzeo en http://bank.htb para descubrir carpetas con la herramienta FFUF
**Comando:**
```bash
ffuf -u http://bank.htb/FUZZ -w /usr/share/wordlists/seclists/Discovery/Web-Content/directory-list-2.3-medium.txt -fs 7322 -t 120
```

Descubrimos 5 rutas disponibles
<img src="/images/Pasted image 20250327225631.png" style="width:100%; height:auto; display:block; margin:auto;">

La ruta uploads es interesante, al momento de tener alguna vía de subir archivos podemos consultar por ese directorio para poder apuntar al archivo subido

en cuanto a otra ruta interesante es http://bank.htb/balance-transfer
<img src="/images/Pasted image 20250327231831.png" style="width:100%; height:auto; display:block; margin:auto;">
Teniendo una lista interminable de archivos, descargando uno al azar nos encontramos con lo siguiente
<img src="/images/Pasted image 20250327231908.png" style="width:100%; height:auto; display:block; margin:auto;">
Un reporte con datos personales, incluyendo email y contraseñas, lamentablemente estos datos están encriptados, como tenemos muchos datos con un peso similar buscamos poder filtrar por el peso del archivo para ver si hay algo interesante
Por tanto usamos curl para esto

<img src="/images/Pasted image 20250327233104.png" style="width:100%; height:auto; display:block; margin:auto;">
Tratamos la salida para quedarnos solo con el identificador .acc y el peso del archivo y lo guardamos en un texto.txt

Luego con grep filtramos los datos de la siguiente manera
<img src="/images/Pasted image 20250327233532.png" style="width:100%; height:auto; display:block; margin:auto;">
y encontramos un archivo que pesa 257
lo descargamos para ver su contenido
<img src="/images/Pasted image 20250327233959.png" style="width:100%; height:auto; display:block; margin:auto;">
Teniendo Email chris@bank.htb
y Password: !##HTBB4nkP4ssw0rd!##

ahora podemos irnos a la sección login.php para probar las credenciales obtenidas
<img src="/images/Pasted image 20250327234114.png" style="width:100%; height:auto; display:block; margin:auto;">
Entramos éxitosamente
<img src="/images/Pasted image 20250327234131.png" style="width:100%; height:auto; display:block; margin:auto;">
# File Upload

yendo a la sección support, nos lleva a la página que anteriormente nos llevaba a un redirect http://bank.htb/support.htb
<img src="/images/Pasted image 20250327234233.png" style="width:100%; height:auto; display:block; margin:auto;">
La cual nos permite realizar subida de archivos, solamente aceptando imagenes
buscando en el código fuente de la página encontramos lo siguiente:
<img src="/images/Pasted image 20250327234343.png" style="width:100%; height:auto; display:block; margin:auto;">
una nota diciendo que las extensiones .htb son válidas y aceptadas para correr aplicaciones .php

por tanto probamos a subir una reverseshell en php de pentestMonkey, guardando el archivo como reverse.htb
<img src="/images/Pasted image 20250327235115.png" style="width:100%; height:auto; display:block; margin:auto;">
<img src="/images/Pasted image 20250327235128.png" style="width:100%; height:auto; display:block; margin:auto;">
 Y conseguimos subirlo exitosamente,
 como antes encontramos la ruta http://bank.htb/uploads
<img src="/images/Pasted image 20250327225631.png" style="width:100%; height:auto; display:block; margin:auto;">
nos ponemos en escucha con
**Comando:**
```bash
nc -nlvp 4444
```
y nos dirigimos a la ruta http://bank.htb/uploads/reverse.htb
y nos dan una shell interactiva
<img src="/images/Pasted image 20250327235918.png" style="width:100%; height:auto; display:block; margin:auto;">
hacemos el tratamiento de tty respectivo
```bash
script /dev/null -c bash
ctrl+z
stty raw -echo; fg
reset xterm
export TERM=xterm
export SHELL=bash
stty rows 40 columns 140
```

# Escalada de privilegios

Obtenemos la flag de bajos privilegios
<img src="/images/Pasted image 20250328000238.png" style="width:100%; height:auto; display:block; margin:auto;">

Despues de analizar vías potenciales al buscar archivos con privilegios SUID tenemos lo siguiente
**Comando:**
```bash
find / -perm -4000 2>/dev/null
```
<img src="/images/Pasted image 20250328001844.png" style="width:100%; height:auto; display:block; margin:auto;">
El archivo /var/htb/bin/emergency no es común, y su propietario es root
<img src="/images/Pasted image 20250328002007.png" style="width:100%; height:auto; display:block; margin:auto;">
Por tanto corremos el archivo para ver qué hace
<img src="/images/Pasted image 20250328002050.png" style="width:100%; height:auto; display:block; margin:auto;">
Y nos da una consola con el usuario root, por tanto ahora nos dirigimos a leer la flag de root y pwneamos la máquina
<img src="/images/Pasted image 20250328002152.png" style="width:100%; height:auto; display:block; margin:auto;">
