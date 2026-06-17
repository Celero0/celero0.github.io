+++ 
draft = false
date = 2026-06-17T06:08:21Z
title = "Waldo Machine - HackTheBox"
description = "Waldo es una máquina Linux de dificultad media cuya explotación se basa en el abuso de vulnerabilidades de lectura arbitraria de archivos, movimiento lateral entre usuarios y el aprovechamiento indebido de Linux Capabilities para obtener privilegios elevados."
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-------------------------
- Tags: #Machine #Linux #Medium  #LFI #LinuxCapabilities
----------------

# Introducción

**Waldo** es una máquina Linux de dificultad media cuya explotación se basa en el abuso de vulnerabilidades de lectura arbitraria de archivos, movimiento lateral entre usuarios y el aprovechamiento indebido de `Linux Capabilities` para obtener privilegios elevados.

Durante la enumeración inicial se identifican los servicios `SSH` y `HTTP` expuestos. A través del análisis de la aplicación web y de las peticiones interceptadas con `Burp Suite`, se descubren los `endpoints` `dirRead.php` y `fileRead.php`, los cuales presentan vulnerabilidades de `Path Traversal` y `Local File Inclusion (LFI)`. Mediante estas vulnerabilidades es posible enumerar directorios del sistema y acceder al contenido de archivos sensibles, obteniendo una clave privada `RSA` perteneciente al usuario `nobody`.

Una vez autenticados mediante `SSH` como `nobody`, se realiza una enumeración interna que permite identificar una segunda instancia de `SSH` y una clave privada adicional perteneciente al usuario `monitor`. Utilizando estas credenciales se consigue movimiento lateral hacia dicha cuenta, aunque inicialmente el acceso se encuentra restringido mediante una `rbash`.

Finalmente, se evade la `restricted bash` aprovechando la ejecución de comandos a través de `SSH` y se lleva a cabo una nueva fase de enumeración local. En ella se identifica que el binario `tac` posee la `capability` `cap_dac_read_search`, la cual permite leer archivos ignorando las restricciones tradicionales de permisos del sistema. Aprovechando esta configuración insegura, es posible acceder a archivos sensibles del usuario `root`, incluyendo la flag `root.txt`, logrando así el compromiso completo de la máquina.

# Enumeración Nmap

Realizamos un escaneo completo de puertos en busca de servicios expuestos:

```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.129.229.141 -oG allPorts
```

Obteniendo los siguientes puertos abiertos:

<img src="/images/Pasted image 20260616012228.png" style="width:100%; height:auto; display:block; margin:auto;">

A continuación, realizamos un escaneo de versiones y scripts sobre los puertos identificados:

```bash
nmap -p22,80 -sCV 10.129.229.141 -oN portServices
```

<img src="/images/Pasted image 20260616012307.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración HTTP

Comenzamos la enumeración del servicio web. Al acceder a la aplicación observamos la siguiente página:

<img src="/images/Pasted image 20260616012328.png" style="width:100%; height:auto; display:block; margin:auto;">

Vemos que tenemos el apartado `List Manager`, donde podemos crear o eliminar listas. Además, si entramos a cada lista, podemos agregar, renombrar o eliminar las sublistas.

<img src="/images/Pasted image 20260616012454.png" style="width:100%; height:auto; display:block; margin:auto;">

Al interceptar las peticiones web con `Burp Suite`, vemos que el mapeado del sitio es el siguiente:

<img src="/images/Pasted image 20260616012547.png" style="width:100%; height:auto; display:block; margin:auto;">

Encontramos dos `endpoints` interesantes: `dirRead.php` y `fileRead.php`.

# Explotando Path Traversal

Si analizamos la petición hacia `dirRead.php`, observamos lo siguiente:

<img src="/images/Pasted image 20260616012725.png" style="width:100%; height:auto; display:block; margin:auto;">

Vemos una solicitud `POST` con el siguiente valor:

```bash
path=./.list/
```

Esta nos muestra una serie de listas, además de `.` y `..`, como si internamente se estuviese ejecutando un comando similar a `ls -a`.

Por lo tanto, podemos intentar realizar un `Path Traversal` utilizando `../`, pero observamos que no funciona.

<img src="/images/Pasted image 20260616013004.png" style="width:100%; height:auto; display:block; margin:auto;">

Por ello, probamos utilizando `....//`, intentando `bypassear` alguna restricción, y comprobamos que logramos explotar el `Path Traversal`.

<img src="/images/Pasted image 20260616013051.png" style="width:100%; height:auto; display:block; margin:auto;">

Con esta técnica podemos identificar la existencia del directorio `/home/nobody`, el cual contiene el directorio `.ssh`, encargado de almacenar las llaves de `SSH`.

<img src="/images/Pasted image 20260616013229.png" style="width:100%; height:auto; display:block; margin:auto;">

Dentro del directorio `/home/nobody/.ssh/` se encuentra un archivo llamado `.monitor`.

<img src="/images/Pasted image 20260616013317.png" style="width:100%; height:auto; display:block; margin:auto;">

# Explotando LFI

Si analizamos ahora el `endpoint` llamado `fileRead.php`, observamos una petición similar a la anterior; sin embargo, esta devuelve el contenido de un archivo, como si estuviese ejecutando un comando similar a `cat`.

<img src="/images/Pasted image 20260616013421.png" style="width:100%; height:auto; display:block; margin:auto;">

Por lo tanto, de forma análoga a la explotación del `Path Traversal`, intentaremos realizar un `Local File Inclusion` sobre el archivo encontrado anteriormente mediante el siguiente payload:

```bash
file=./.list/....//....//....//....//home//nobody//.ssh//.monitor
```

Obteniendo una clave `RSA`, cuyo formato no está sanitizado, debido a que presenta secuencias `\n` y otros caracteres adicionales.

<img src="/images/Pasted image 20260616013615.png" style="width:100%; height:auto; display:block; margin:auto;">

Por lo tanto, la guardamos y eliminamos los saltos de línea, quedando como se muestra a continuación:

<img src="/images/Pasted image 20260616013728.png" style="width:100%; height:auto; display:block; margin:auto;">

Como el usuario propietario del `id_rsa` era `nobody`, intentaremos autenticarnos mediante `SSH` utilizando la clave obtenida con el siguiente comando:

```bash
ssh nobody@10.129.229.141 -i id_rsa
```

Logrando acceder exitosamente y encontrando la flag `user.txt`.

<img src="/images/Pasted image 20260616013929.png" style="width:100%; height:auto; display:block; margin:auto;">

# Movimiento lateral

Como nuestra shell inicial es una `sh`, migramos a una `bash` con el siguiente comando:

```bash
export SHELL=/bin/bash
```

Una vez realizado este cambio, debemos exportar nuestro `PATH`, debido a que el `PATH` disponible en la `SHELL` es muy limitado. Para ello, primero podemos visualizar nuestro `PATH` actual con el siguiente comando:

```bash
echo $PATH
```

Y posteriormente ampliar el `PATH` de la máquina víctima utilizando el siguiente comando:

```bash
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.dotnet/tools:/root/.local/bin:/root/.local/bin
```

Ahora podemos utilizar correctamente el siguiente comando:

```bash
netstat -an
```

Encontrando los puertos activos en la máquina víctima. Entre ellos, destaca el puerto 8888.

<img src="/images/Pasted image 20260616014657.png" style="width:100%; height:auto; display:block; margin:auto;">

Como posible servicio ejecutándose en dicho puerto, y considerando que mantiene una conexión establecida con nuestra IP, podemos inferir que podría tratarse de `SSH`. Por ello, revisamos los archivos de configuración de este servicio:

```bash
cat /etc/ssh/sshd_config
```

Confirmando que `SSH` está corriendo sobre el puerto 8888.

<img src="/images/Pasted image 20260616015237.png" style="width:100%; height:auto; display:block; margin:auto;">

Sin embargo, durante el escaneo inicial observamos que el puerto 22 también ejecuta `SSH` y se encuentra accesible. Por ello, podemos intentar conectarnos utilizando el `id_rsa` denominado `.monitor`:

```bash
ssh monitor@localhost -i /home/nobody/.ssh/.monitor -p 22
```

Comprobando que obtenemos acceso, aunque restringidos a una `rbash` (`restricted bash`).

<img src="/images/Pasted image 20260617014204 1.png" style="width:100%; height:auto; display:block; margin:auto;">

# Escalada de privilegios

Para escapar de esta `restricted bash`, y dado que la conexión inicial se realiza mediante `SSH`, podemos especificar un comando antes de establecer la sesión:

```bash
ssh monitor@localhost -i /home/nobody/.ssh/.monitor -p 22 bash
```

De esta forma obtenemos acceso a una consola interactiva sin restricciones.

<img src="/images/Pasted image 20260617014318.png" style="width:100%; height:auto; display:block; margin:auto;">

Si intentamos buscar `capabilities` utilizando el comando `getcap`, aparecerá un error. Esto ocurre debido a que el `PATH` es nuevamente muy limitado, por lo que volveremos a ampliarlo:

```bash
export PATH=/home/monitor/bin:/home/monitor/app-dev:/home/monitor/app-dev/v0.1:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.dotnet/tools:/root/.local/bin:/root/.local/bin
```

Ahora podemos ejecutar el siguiente comando para buscar `capabilities`:

```bash
getcap -r / 2>/dev/null
```

Encontrando la `capability` `cap_dac_read_search+ei`.

<img src="/images/Pasted image 20260617014710.png" style="width:100%; height:auto; display:block; margin:auto;">

Esta `capability` permite leer archivos aunque el usuario no posea permisos de lectura sobre ellos. Dado que el binario `tac` posee este privilegio, y considerando que funciona de manera similar a `cat`, aunque invirtiendo el orden de las líneas, podemos utilizarlo para leer archivos sensibles del sistema.

Por lo tanto, podríamos leer directamente la `root.txt` con el siguiente comando:

```bash
tac /root/root.txt
```

Y obtenemos la flag.

<img src="/images/Pasted image 20260617015033.png" style="width:100%; height:auto; display:block; margin:auto;">

De forma similar, también podemos leer el `id_rsa` de `root` o el archivo `/etc/shadow`:

```bash
tac /root/.ssh/id_rsa -s ,
```

<img src="/images/Pasted image 20260617015437.png" style="width:100%; height:auto; display:block; margin:auto;">

El problema radica en que no existen permisos para iniciar sesión como `root` mediante `SSH`. Si revisamos la configuración:

```bash
cat /etc/ssh/sshd_config | grep -i "root"
```

Observamos que la directiva `PermitRootLogin` está deshabilitada:

```text
PermitRootLogin no
```

<img src="/images/Pasted image 20260617015611.png" style="width:100%; height:auto; display:block; margin:auto;">

# Conclusión

La resolución de **Waldo** demuestra cómo vulnerabilidades aparentemente simples, como un `Path Traversal` y un `Local File Inclusion`, pueden derivar en el compromiso total de un sistema cuando se combinan con una correcta enumeración y configuraciones inseguras. A través del acceso inicial como `nobody`, el movimiento lateral hacia `monitor` y el abuso de la `capability` `cap_dac_read_search` asignada al binario `tac`, fue posible obtener acceso a información sensible y completar la escalada de privilegios hasta `root`.

Esta máquina destaca la importancia de validar adecuadamente las entradas de las aplicaciones web, restringir el acceso a archivos sensibles y revisar periódicamente las `Linux Capabilities` asignadas a los binarios del sistema para evitar que mecanismos diseñados para otorgar privilegios específicos se conviertan en vectores de ataque.
