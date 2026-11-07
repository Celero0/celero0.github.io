+++
draft = false
title = "Enrutamiento Intervlan con OSPF"
date = 2026-11-02T00:00:00Z
description = "Laboratorio de routing y switching: VLANs, EtherChannel, MST, SVIs, DHCP y OSPFv2/OSPFv3 en una red corporativa segmentada."
weight = 1
tags = []
categories = []
slug = ""
authors = []
externalLink = ""
series = []
+++

---
- Tags: #STP #MST #IPv6 #OSPF #VLAN #DHCP #EtherChannel
---

# Introducción

En este laboratorio se construye una red corporativa segmentada en VLANs sobre cuatro switches y se conecta a un backbone OSPF a través de dos routers. El objetivo es practicar, de punta a punta, los temas de switching y routing que aparecen en entornos reales:

- Segmentación de capa 2 con VLANs y enlaces troncales 802.1Q.
- Agregación de enlaces con EtherChannel (LACP, PAgP y modo `on`).
- Spanning Tree Multiple (MST) con regiones e instancias.
- Seguridad de puerto y estabilización de STP.
- Enrutamiento inter-VLAN con SVIs en un switch de capa 3.
- DHCP centralizado.
- OSPFv2 y OSPFv3 (IPv4 e IPv6), áreas, redistribución de ruta por defecto, temporizadores y enlaces point-to-point.

# Topología

<img src="/images/Pasted image 20250409193253.png" style="width:100%; height:auto; display:block; margin:auto;">

- **SW1, SW2 y SW3**: switches de acceso.
- **SW4**: switch de capa 3; concentra las SVIs, el servidor DHCP y el gateway de las VLANs.
- **R1**: router de borde entre el área 1 y el área 0.
- **R2**: router del área 0 con salida al ISP.
- **ISP**: router externo que representa Internet.

# Requerimientos

- Crear las VLAN 12, 13, 14, 15 y 16, y usar la VLAN 17 como nativa en los troncales.
- Agregar los enlaces entre switches con EtherChannel, combinando los modos `on`, `active/passive` y `desirable/auto`.
- Configurar los puertos de acceso con port-security, BPDU guard, BPDU filter y PortFast.
- Implementar MST con las instancias 1, 2 y 3.
- Configurar las SVIs en SW4 y el direccionamiento IPv4/IPv6 de cada VLAN.
- Habilitar DHCP para las VLAN 13, 14, 15 y 16.
- Configurar OSPFv2 y OSPFv3 entre SW4, R1 y R2.
- Propagar una ruta por defecto desde R2 y ajustar temporizadores y el tipo de red del enlace R1-R2.

# Desarrollo

## 1. Configuración base: hostname, VLANs y dúplex

Cada switch arranca con su hostname, crea las VLAN de datos y desactiva VTP en modo transparente. En modo `transparent` el switch no propaga ni aprende VLANs por VTP: cada uno mantiene su propia base de datos local, que es lo deseado en este laboratorio.

Además, en SW1 y SW2 se fuerza `duplex half` en las interfaces `e0/2-3` para corregir el error de *duplex mismatch* que aparece en la topología.

**SW1**

```bash
en
conf t
host SW1
vlan 12,13,14,15,16
ex
vtp mode transparent
int ran e0/2-3
duplex half
exit
```

**SW2**

```bash
en
conf t
host SW2
vlan 12,13,14,15,16
ex
vtp mode transparent
int ran e0/2-3
duplex half
exit
```

**SW3**

```bash
en
conf t
host SW3
vlan 12,13,14,15,16
exit
vtp mode transparent
```

**SW4**

```bash
en
conf t
host SW4
vlan 12,13,14,15,16
vtp mode transparent
exit
```

## 2. EtherChannel

Los enlaces entre switches se agrupan para sumar ancho de banda y evitar que STP bloquee puertos redundantes. Se usan tres formas de negociación:

- `on`: agrega el canal de forma estática, sin negociación.
- `active` / `passive`: LACP (IEEE 802.3ad).
- `desirable` / `auto`: PAgP (propietario de Cisco).

Los números de `channel-group` son locales de cada switch; lo que debe coincidir es la compatibilidad de modos entre los dos extremos. Como referencia, el switch con menor número suele quedar como activo del agregado.

**SW1**

```bash
int ran e1/0-1
channel-group 1 mode on
ex
int ran e1/2-3
channel-group 5 mode desirable
ex
int ran e0/0-1
channel-group 4 mode active
ex
```

**SW2**

```bash
int ran e1/2-3
channel-group 3 mode desirable
ex
int ran e1/0-1
channel-group 6 mode on
ex
int ran e0/0-1
channel-group 4 mode passive
ex
```

**SW3**

```bash
int ran e1/2-3
channel-group 5 mode auto
ex
int ran e1/0-1
channel-group 6 mode on
ex
int ran e0/0-1
channel-group 2 mode desirable
ex
```

**SW4**

```bash
int ran e1/2-3
channel-group 3 mode auto
ex
int ran e1/0-1
channel-group 1 mode on
ex
int ran e0/0-1
channel-group 2 mode auto
ex
```

## 3. Enlaces troncales

Todos los enlaces entre switches se configuran como troncales 802.1Q. Se permite el paso de las VLAN 12 a 16, se define la VLAN 17 como nativa y se desactiva DTP con `switchport nonegotiate` para que el troncal no negocie su modo.

**SW1, SW2, SW3 y SW4** (mismo bloque en los cuatro)

```bash
int ran e0/0-1, e1/0-3
sw tr encap dot1q
sw mo tr
sw tr all vlan 12,13,14,15,16
sw tr native vlan 17
sw nonego
no shut
ex
```

## 4. Puertos de acceso y seguridad

Los puertos que conectan equipos finales se dejan en modo acceso y se protegen con:

- `switchport port-security`: limita las MAC aprendidas por puerto.
- `spanning-tree bpduguard enable`: apaga el puerto si recibe un BPDU (evita que un switch no autorizado se conecte).
- `spanning-tree bpdufilter enable`: deja de enviar y procesar BPDUs en ese puerto.
- `spanning-tree portfast`: pasa el puerto directamente a *forwarding*, sin esperar los estados de STP.

**SW1**

```bash
int e0/2
sw mo acc
sw acc vlan 13
sw port-security
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
no shut
ex
int e0/3
sw mo acc
sw acc vlan 14
sw port-security
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
no shut
ex
```

**SW2**

```bash
int e0/2
sw mo acc
sw acc vlan 15
sw port-security
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
no shut
ex
int e0/3
sw mo acc
sw acc vlan 16
sw port-security
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
no shut
ex
```

## 5. MST (Multiple Spanning Tree)

MST agrupa las VLANs en instancias y permite un árbol distinto por instancia, en lugar de uno solo para todas las VLANs. La configuración debe ser idéntica en todos los switches que pertenezcan a la misma región: mismo `name`, misma `revision` y el mismo mapeo de VLANs a instancias.

<img src="/images/Pasted image 20250409200954.png" style="width:100%; height:auto; display:block; margin:auto;">
<img src="/images/Pasted image 20250409201026.png" style="width:100%; height:auto; display:block; margin:auto;">

**SW1**

```bash
spanning-tree mode mst
spanning-tree mst configuration
name REGION13
revision 1
instance 1 vlan 12, 17
instance 2 vlan 13, 15
instance 3 vlan 14, 16
ex
```

**SW2**

```bash
spanning-tree mode mst
spanning-tree mst configuration
name REGION13
revision 1
instance 1 vlan 12, 17
instance 2 vlan 13, 15
instance 3 vlan 14, 16
ex
```

**SW4**

```bash
spanning-tree mode mst
spanning-tree mst configuration
name REGION13
revision 1
instance 1 vlan 12, 17
instance 2 vlan 13, 15
instance 3 vlan 14, 16
ex
```

**SW3**

```bash
spanning-tree mode mst
spanning-tree mst configuration
name REGION31
revision 2
instance 1 vlan 12, 17
instance 2 vlan 13, 15
instance 3 vlan 14, 16
ex
```

> **Nota:** en los apuntes originales SW3 quedó con `REGION31` / `revision 2`. Para que todos los switches formen una única región MST, el `name` y la `revision` deben ser iguales en los cuatro; si buscas una sola región, alinea SW3 con `REGION13` / `revision 1`.

## 6. SVIs y direccionamiento de las VLANs

SW4 es el switch de capa 3 y actúa como gateway de cada VLAN mediante interfaces virtuales (SVI). Cada SVI recibe la primera dirección IPv4 e IPv6 de su subred.

<img src="/images/Pasted image 20250409200723.png" style="width:100%; height:auto; display:block; margin:auto;">

**SW4**

```bash
int vlan 12
ip add 192.168.10.1 255.255.255.0
ipv6 address 3001:ABCD:ABCD:08::1/64
no shut
ex
int vlan 13
ip add 192.168.20.1 255.255.255.0
ipv6 address 3001:ABCD:ABCD:A6::1/64
no shut
ex
int vlan 14
ip add 192.168.22.1 255.255.255.0
ipv6 address 3001:ABCD:ABCD:B2::1/64
no shut
ex
int vlan 15
ip add 192.168.24.1 255.255.255.0
ipv6 address 3001:ABCD:ABCD:C4::1/64
no shut
ex
int vlan 16
ip add 192.168.26.1 255.255.255.0
ipv6 address 3001:ABCD:ABCD:C8::1/64
no shut
ex
```

## 7. Configuración administrativa de los switches

Para administrar SW1, SW2 y SW3 se les asigna una SVI en la VLAN 12 y un `default-gateway` que apunta a la SVI de SW4. Sin el gateway, el switch solo podría comunicarse con su propia subred.

<img src="/images/Pasted image 20250409200710.png" style="width:100%; height:auto; display:block; margin:auto;">

**SW1**

```bash
int vlan 12
ip add 192.168.10.2 255.255.255.0
ipv6 add 3001:ABCD:ABCD:08::2/64
ex
ip default-gateway 192.168.10.1
```

**SW2**

```bash
int vlan 12
ip add 192.168.10.3 255.255.255.0
ipv6 add 3001:ABCD:ABCD:08::3/64
ex
ip default-gateway 192.168.10.1
```

**SW3**

```bash
int vlan 12
ip add 192.168.10.4 255.255.255.0
ipv6 add 3001:ABCD:ABCD:08::4/64
ex
ip default-gateway 192.168.10.1
```

## 8. Servidor DHCP

SW4 entrega direcciones a las VLAN 13, 14, 15 y 16. Primero se excluyen las primeras diez direcciones de cada subred (reservadas para gateways y equipos fijos) y luego se crea un pool por VLAN con su `default-router`.

**SW4**

```bash
ip dhcp excluded-address 192.168.20.1 192.168.20.10
ip dhcp excluded-address 192.168.22.1 192.168.22.10
ip dhcp excluded-address 192.168.24.1 192.168.24.10
ip dhcp excluded-address 192.168.26.1 192.168.26.10
ip dhcp pool VLAN13
network 192.168.20.0 255.255.255.0
default-router 192.168.20.1
ex
ip dhcp pool VLAN14
network 192.168.22.0 255.255.255.0
default-router 192.168.22.1
ex
ip dhcp pool VLAN15
network 192.168.24.0 255.255.255.0
default-router 192.168.24.1
ex
ip dhcp pool VLAN16
network 192.168.26.0 255.255.255.0
default-router 192.168.26.1
ex
```

## 9. Habilitar el routing de capa 3

Un switch de capa 3 no enruta por defecto. Hay que habilitar `ip routing` para IPv4 e `ipv6 unicast-routing` para IPv6. Después, el puerto `e0/2` que conecta con R1 se convierte en puerto enrutado con `no switchport` y recibe la dirección del enlace /30 (IPv4) y /112 (IPv6).

**SW4**

```bash
ip routing
ipv6 unicast-routing
```

<img src="/images/Pasted image 20250409224950.png" style="width:100%; height:auto; display:block; margin:auto;">

**SW4 — enlace hacia R1**

```bash
int e0/2
no sw
ip add 192.168.41.1 255.255.255.252
ipv6 add 3001:ABCD:ABCD:41::1/112
no shut
ex
```

## 10. OSPFv2 y OSPFv3

La red se divide en dos áreas:

- **Área 1**: VLANs de SW4 y el enlace SW4-R1.
- **Área 0**: enlace R1-R2 y salida al ISP.

SW4 anuncia sus subredes y marca las SVIs como `passive-interface`, porque en esas interfaces no hay vecinos OSPF que descubrir. R1 actúa como ABR entre el área 1 y el área 0. R2 cierra el dominio y conecta con el ISP.

### SW4

**IPv4**

```bash
router ospf 1
router-id 4.4.4.4
network 192.168.10.0 0.0.0.255 area 1
network 192.168.20.0 0.0.0.255 area 1
network 192.168.22.0 0.0.0.255 area 1
network 192.168.24.0 0.0.0.255 area 1
network 192.168.26.0 0.0.0.255 area 1
network 192.168.41.0 0.0.0.3 area 1
passive-interface vlan 12
passive-interface vlan 13
passive-interface vlan 14
passive-interface vlan 15
passive-interface vlan 16
ex
```

**IPv6**

```bash
ipv6 router ospf 1
router-id 4.4.4.4
passive-interface vlan 12
passive-interface vlan 13
passive-interface vlan 14
passive-interface vlan 15
passive-interface vlan 16
ex
int vlan 12
ipv6 ospf 1 area 1
ex
int vlan 13
ipv6 ospf 1 area 1
ex
int vlan 14
ipv6 ospf 1 area 1
ex
int vlan 15
ipv6 ospf 1 area 1
ex
int vlan 16
ipv6 ospf 1 area 1
ex
int e0/2
ipv6 ospf 1 area 1
ex
```

### R1

**IPv4**

```bash
int e0/2
ip add 192.168.41.2 255.255.255.252
ex
ipv6 unicast-routing
router ospf 1
router-id 1.1.1.1
network 192.168.41.0 0.0.0.3 area 1
network 192.168.21.0 0.0.0.3 area 0
ex
```

**IPv6**

```bash
ipv6 router ospf 1
router-id 1.1.1.1
ex
int e0/2
ipv6 ospf 1 area 1
ex
int e0/0
ipv6 ospf 1 area 0
ex
```

### R2

**IPv4**

```bash
ipv6 unicast-routing
router ospf 1
router-id 2.2.2.2
network 192.168.21.0 0.0.0.3 area 0
ex
```

**IPv6**

```bash
ipv6 router ospf 1
router-id 2.2.2.2
ex
int e0/0
ipv6 ospf 1 area 0
ex
```

## 11. Ruta por defecto y redistribución

R2 conoce al ISP por una ruta estática por defecto. Con `default-information originate` OSPF la inyecta en el dominio para que el resto de los routers sepan cómo salir a Internet. El ISP, a su vez, apunta su propia ruta por defecto hacia el siguiente salto de la topología.

**R2**

```bash
ip route 0.0.0.0 0.0.0.0 200.0.0.1
ex
ipv6 route ::/0 3001:ABCD:ABCD:200::1
ex
router ospf 1
default-information originate
ex
ipv6 router ospf 1
default-information originate
ex
```

**ISP**

```bash
ip route 0.0.0.0 0.0.0.0 200.0.0.2
ex
ipv6 route ::/0 3001:ABCD:ABCD:200::2
ex
```

## 12. Temporizadores OSPF

Por defecto OSPF usa `hello 10` y `dead 40`. En este laboratorio se ajustan a `hello 20` y `dead 80` en los enlaces entre SW4, R1 y R2. El `dead-interval` debe ser, como mínimo, cuatro veces el `hello`, y **ambos extremos del enlace deben coincidir** o la vecindad no se forma.

**SW4**

```bash
int e0/2
ip ospf hello-interval 20
ip ospf dead-interval 80
ipv6 ospf hello-interval 20
ipv6 ospf dead-interval 80
ex
```

**R1**

```bash
int e0/2
ip ospf hello-interval 20
ip ospf dead-interval 80
ipv6 ospf hello-interval 20
ipv6 ospf dead-interval 80
ex
int e0/0
ip ospf hello-interval 20
ip ospf dead-interval 80
ipv6 ospf hello-interval 20
ipv6 ospf dead-interval 80
ex
```

**R2**

```bash
int e0/0
ip ospf hello-interval 20
ip ospf dead-interval 80
ipv6 ospf hello-interval 20
ipv6 ospf dead-interval 80
ex
```

## 13. OSPF point-to-point

En un enlace dedicado entre dos routers no tiene sentido elegir DR y BDR. Al declarar la interfaz como `point-to-point`, OSPF omite la elección, forma la vecindad directamente y converge más rápido.

**R1**

```bash
int e0/0
ip ospf network point-to-point
ex
```

**R2**

```bash
int e0/0
ip ospf network point-to-point
ex
```

## Verificación

Comandos útiles para comprobar cada capa:

- **Capa 2**
  - `show vlan brief`
  - `show etherchannel summary` (los canales deben aparecer en estado `SU`/`P`).
  - `show spanning-tree mst configuration`
  - `show spanning-tree mst`
- **Direccionamiento y DHCP**
  - `show ip interface brief` y `show ipv6 interface brief`
  - `show ip dhcp binding`
  - `show ip dhcp pool`
- **OSPF**
  - `show ip ospf neighbor` (las vecindades deben estar en `FULL`).
  - `show ip ospf interface brief`
  - `show ip route ospf` y `show ipv6 route ospf`
  - `show ip route 0.0.0.0` y `show ipv6 route ::/0`
- **Conectividad**
  - `ping` entre VLANs y hacia el loopback del ISP.
  - `traceroute` para confirmar el path SW4 → R1 → R2 → ISP.

# Conclusión

Este laboratorio integra el ciclo completo de una red corporativa: segmentación en capa 2, agregación de enlaces, STP/MST, direccionamiento y gateway en un switch de capa 3, DHCP y un dominio OSPF de dos áreas con IPv4 e IPv6.

Los errores más comunes que conviene revisar al reproducirlo son: que todos los switches de la región MST compartan `name` y `revision`, que los temporizadores OSPF coincidan en ambos extremos, que las VLANs estén permitidas en los troncales, y que las SVIs estén marcadas como `passive-interface` cuando no tienen vecinos.
