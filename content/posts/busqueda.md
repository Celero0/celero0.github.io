+++ 
draft = false
date = 2025-12-07T17:16:26Z
title = "Busqueda Machine - HackTheBox"
description = "Esta es una máquina Linux, de dificultad Easy de la plataforma HackTheBox"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-------------------------
- Tags: #Machine #Linux #Easy #Gitea #Docker
----------------

# Enumeración Nmap

**Comando:**

```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.10.11.208 -oG allPorts
```

<img src="/images/Pasted image 20250402145959.png" style="width:100%; height:auto; display:block; margin:auto;">

Como información relevante aparece un redirect hacia ```http://searcher.htb```

<img src="/images/Pasted image 20250402150147.png" style="width:100%; height:auto; display:block; margin:auto;">

Lo agregamos al ```/etc/hosts``` 

<img src="/images/Pasted image 20250402150329.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración puerto HTTP 80

En ```http://searcher.htb``` encontramos datos relevantes de las versiones de las tecnologías que corren por la web

<img src="/images/Pasted image 20250402150600.png" style="width:100%; height:auto; display:block; margin:auto;">

La web deja insertar texto para realizar una busqueda web

<img src="/images/Pasted image 20250402150645.png" style="width:100%; height:auto; display:block; margin:auto;">

Dando como respuesta

<img src="/images/Pasted image 20250402150715.png" style="width:100%; height:auto; display:block; margin:auto;">

# Buscando posibles CVE de la versión

<img src="/images/Pasted image 20250402150837.png" style="width:100%; height:auto; display:block; margin:auto;">

En la tercera opción encontramos un script interesante en sh, y una breve explicación de su uso:

<img src="/images/Pasted image 20250402150932.png" style="width:100%; height:auto; display:block; margin:auto;">

Lo descargamos y lo utilizamos como dice

<img src="/images/Pasted image 20250402151000.png" style="width:100%; height:auto; display:block; margin:auto;">

Obteniendo una reverse shell:


<img src="/images/Pasted image 20250402151256.png" style="width:100%; height:auto; display:block; margin:auto;">

# Tratamiento tty

Realizamos el tratamiento correspondiente de tty para trabajar de forma más cómoda

**Comando:**

```bash
script /dev/null -c bash
ctrl+z
stty raw -echo; fg
reset xterm
export TERM=xterm
export SHELL=bash
stty rows 40 columns 140
```

# Escalada de privilegios

Comenzamos viendo los puertos activos de la máquina víctima

<img src="/images/Pasted image 20250402152132.png" style="width:100%; height:auto; display:block; margin:auto;">

Teniendo como resultado varios puertos con el siguiente comando buscaremos más información

**Comando:**

```bash
curl 127.0.0.1:3000
```

Obtenemos respuesta de una página web que está corriendo *Gitea* , viendo el código html obtenemos el subdominio ```http://gitea.searcher.htb```

<img src="/images/Pasted image 20250402152610.png" style="width:100%; height:auto; display:block; margin:auto;">

Lo agregamos a ```/etc/hosts``` y enumeramos el nuevo subdominio por http

<img src="/images/Pasted image 20250402152825.png" style="width:100%; height:auto; display:block; margin:auto;">

<img src="/images/Pasted image 20250402152852.png" style="width:100%; height:auto; display:block; margin:auto;">

En el apartado de usuarios, nos encontramos con dos: administrador y cody

<img src="/images/Pasted image 20250402152937.png" style="width:100%; height:auto; display:block; margin:auto;">

En la máquina víctima tenemos la carpeta .git con información sobre la página gitea

<img src="/images/Pasted image 20250402153057.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto realizamos una busqueda de palabras claves con el siguiente comando

**Comando:**

```bash
grep -r -i "password" 2>/dev/null
grep -r -i "cody" 2>/dev/null
grep -r -i "administrator" 2>/dev/null
```

<img src="/images/Pasted image 20250402153224.png" style="width:100%; height:auto; display:block; margin:auto;">

Tenemos dos posibles contraseñas que guardaremos

```bash
cody:jh1usoih2bkjaspwe92
administrator:5ede9ed9f2ee636b5eb559fdedfd006d2eae86f4
```

Creamos un archivo pass y guardamos el contenido

<img src="/images/Pasted image 20250402153608.png" style="width:100%; height:auto; display:block; margin:auto;">

Buscamos usuarios locales en la máquina víctima

<img src="/images/Pasted image 20250402153913.png" style="width:100%; height:auto; display:block; margin:auto;">

Tenemos solo al usuario ```svc``` y a ```root``` por tanto nos intentamos conectar por ssh a ambos usuarios con las posibles contraseñas que encontramos anteriormente

<img src="/images/Pasted image 20250402154044.png" style="width:100%; height:auto; display:block; margin:auto;">

Entramos exitosamente por ssh

<img src="/images/Pasted image 20250402154124.png" style="width:100%; height:auto; display:block; margin:auto;">

Aprovechamos que tenemos la contraseña para buscar privilegios sudo

<img src="/images/Pasted image 20250402154214.png" style="width:100%; height:auto; display:block; margin:auto;">

Como tenemos ```cody:jh1usoih2bkjaspwe92```, introducimos las credenciales en gitea

nos logeamos en la página web pero no encontramos nada relevante

<img src="/images/Pasted image 20250402154937.png" style="width:100%; height:auto; display:block; margin:auto;">

Volvemos a la máquina víctima probando la aplicación que podemos utilizar sudo

<img src="/images/Pasted image 20250402155040.png" style="width:100%; height:auto; display:block; margin:auto;">

<img src="/images/Pasted image 20250402155121.png" style="width:100%; height:auto; display:block; margin:auto;">

#Docker

Buscamos en google por docker inspect opciones

<img src="/images/Pasted image 20250402160040.png" style="width:100%; height:auto; display:block; margin:auto;">

y en formato tenemos lo siguiente ```'{{json .Config}}'```

<img src="/images/Pasted image 20250402160103.png" style="width:100%; height:auto; display:block; margin:auto;">

<img src="/images/Pasted image 20250402160241.png" style="width:100%; height:auto; display:block; margin:auto;">

encontramos una posible contraseña ```yuiu1hoiu4i5ho1uh```

Probamos utilizar en gitea con el usuario administrator

<img src="/images/Pasted image 20250402160413.png" style="width:100%; height:auto; display:block; margin:auto;">

Buscando en los scripts privados del usuario administrator encontramos el script *system-checkup.py* en la página ```http://gitea.searcher.htb/administrator/scripts```

<img src="/images/Pasted image 20250402160820.png" style="width:100%; height:auto; display:block; margin:auto;">

<img src="/images/Pasted image 20250402161058.png" style="width:100%; height:auto; display:block; margin:auto;">

Encontramos un posible punto de entrada, la única action que tiene un script que lo busca en el directorio actual es `./full-checkup.sh`

por tanto crearemos un script con ese nombre y le pondremos el siguiente script

```bash
#!/bin/bash
chmod u+s /bin/bash
```

<img src="/images/Pasted image 20250402161455.png" style="width:100%; height:auto; display:block; margin:auto;">

corremos el script

<img src="/images/Pasted image 20250402161911.png" style="width:100%; height:auto; display:block; margin:auto;">

y ahora intentamos utilizar bash con la bandera -p para tener una consola con privilegios root

<img src="/images/Pasted image 20250402161941.png" style="width:100%; height:auto; display:block; margin:auto;">

obtenemos privilegios root y Pwneamos la máquina
