+++
draft = false
title = "Implementación de STP en Redes de Datos"
date = 2026-11-07T12:00:00Z
description = "Laboratorio de switching: VLANs, troncales 802.1Q, puertos de acceso seguros, STP con root bridge por VLAN, router-on-a-stick y OSPFv2/OSPFv3."
weight = 4
tags = []
categories = []
slug = ""
authors = []
externalLink = ""
series = []
+++

---
- Tags: #STP #VLAN #BPDUGuard #PortFast #OSPF #IPv6
---

# Introducción

En este laboratorio se construye una red de campus segmentada en VLANs y se profundiza en **Spanning Tree Protocol (STP)**, el protocolo que evita bucles de capa 2 cuando hay enlaces redundantes entre switches.

El objetivo es practicar el ciclo completo de una red de datos:

- Segmentación con VLANs y enlaces troncales 802.1Q.
- Corrección de errores de dúplex en los enlaces.
- Protección de puertos de acceso con port-security, BPDU guard, BPDU filter y PortFast.
- Administración remota de los switches mediante una SVI en la VLAN de gestión.
- Enrutamiento inter-VLAN con **router-on-a-stick** (subinterfaces).
- Elección manual del **root bridge** de STP por VLAN.
- OSPFv2 y OSPFv3 (IPv4 e IPv6).
- Rutas por defecto con balanceo de carga y redistribución en OSPF.

# Topología

<img src="/images/Pasted image 20250401212626.png" style="width:100%; height:auto; display:block; margin:auto;">

- **BORDE**: router de borde con dos enlaces hacia el ISP (`200.0.0.0/30` y `201.0.0.0/30`).
- **ISP**: router externo con loopback `8.8.8.8/32`; representa Internet.
- **RA**: router de distribución; conecta con BORDE por `192.168.11.0/24` y con SWC por un troncal (router-on-a-stick).
- **SWA, SWB, SWC y SWD**: switches de acceso formando un cuadrado redundante.
- **VLANs**: 110 RRHH, 120 Ventas, 130 Marketing, 140 Informática y 200 Administración.
- **PC de administración**: conectado a SWD en la VLAN 200.

| VLAN | Nombre | IPv4 | IPv6 |
|---|---|---|---|
| 110 | RRHH | `10.10.110.0/24` | `3001:ACAD:ACAD:A::/64` |
| 120 | Ventas | `10.10.120.0/24` | `3001:ACAD:ACAD:B::/64` |
| 130 | Marketing | `10.10.130.0/24` | `3001:ACAD:ACAD:C::/64` |
| 140 | Informática | `10.10.140.0/24` | `3001:ACAD:ACAD:D::/64` |
| 200 | Administración | `10.10.200.0/24` | `3001:ACAD:ACAD:F::/64` |

# Requerimientos

- Crear las VLAN 110, 120, 130, 140 y 200 en los cuatro switches.
- Corregir el *duplex mismatch* en los enlaces afectados.
- Configurar los puertos de acceso con port-security, BPDU guard, BPDU filter y PortFast.
- Configurar los enlaces entre switches como troncales 802.1Q sin negociación DTP.
- Asignar una SVI de administración en la VLAN 200 y un `default-gateway`.
- Configurar router-on-a-stick en RA para las cinco VLANs (IPv4 e IPv6).
- Hacer que **SWA** sea root de STP para las VLAN 110 y 130, y **SWC** para las VLAN 120 y 140.
- Configurar OSPFv2 y OSPFv3 entre RA y BORDE.
- Publicar una ruta por defecto con balanceo de carga y redistribuirla en OSPF.

# Desarrollo

## 1. Corrección de dúplex y creación de VLANs

Antes de tocar STP hay que estabilizar los enlaces. En SWA, SWB y SWD aparece un error de *duplex mismatch* en algunos puertos; se fuerza `duplex half` en las interfaces indicadas para que ambos extremos negocien el mismo modo.

**SWA y SWB**

```bash
en
conf t
int ran e0/2-3
duplex half
exit
```

**SWD**

```bash
en
conf t
host SWD
int e0/3
duplex half
ex
```

Después se crean las VLAN de datos y la VLAN de gestión en los cuatro switches. Al no usar VTP, cada switch mantiene su propia base de datos local.

**SWA, SWB, SWC y SWD**

```bash
en
conf t
vlan 110,120,130,140,200
ex
```

<img src="/images/Pasted image 20250401213157.png" style="width:100%; height:auto; display:block; margin:auto;">

## 2. Puertos de acceso y seguridad de capa 2

Los puertos que conectan equipos finales se configuran en modo acceso y se protegen con cuatro mecanismos:

- `switchport port-security`: limita las MAC que puede aprender el puerto.
- `spanning-tree bpduguard enable`: apaga el puerto si recibe un BPDU (evita que un switch no autorizado se conecte).
- `spanning-tree bpdufilter enable`: deja de enviar y procesar BPDUs en ese puerto.
- `spanning-tree portfast`: pasa el puerto a *forwarding* sin esperar los estados de STP.

**SWA** — VLAN 110 y 120

```bash
int e0/2
no shut
sw mo acc
sw acc vlan 110
sw port-security
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
ex
int e0/3
no shut
sw mo acc
sw acc vlan 120
sw port-security
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
ex
```

**SWB** — VLAN 130 y 140

```bash
int e0/2
no shut
sw mo acc
sw acc vlan 130
sw port-security
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
ex
int e0/3
no shut
sw mo acc
sw acc vlan 140
sw port-security
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
ex
```

**SWD** — VLAN 200 (PC de administración)

```bash
int e0/3
no shut
sw mo acc
sw acc vlan 200
sw port-security
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
ex
```

## 3. Troncales 802.1Q

Todos los enlaces entre switches transportan las cinco VLANs. Se configura encapsulación `dot1q`, se permite el paso de las VLANs y se desactiva DTP con `switchport nonegotiate`.

**SWA**

```bash
int ran e0/1, e1/0
sw tr encapsu dot1q
sw mo tr
sw tr all vlan 110,120,130,140,200
sw nonego
ex
```

**SWB**

```bash
int ran e0/1, e1/1
sw tr encapsu dot1q
sw mo tr
sw tr all vlan 110,120,130,140,200
sw nonego
ex
```

**SWC**

```bash
int ran e1/0, e0/0, e1/2
sw tr encapsu dot1q
sw mo tr
sw tr all vlan 110,120,130,140,200
sw nonego
ex
```

**SWD**

```bash
int ran e1/1, e0/0
sw tr encapsu dot1q
sw mo tr
sw tr all vlan 110,120,130,140,200
sw nonego
ex
```

## 4. Administración remota de los switches

Para administrar los switches por SSH o Telnet se les asigna una SVI en la VLAN 200. El `default-gateway` apunta a la subinterfaz de RA en esa VLAN (`10.10.200.1`); sin él, el switch solo podría comunicarse dentro de su propia subred.

<img src="/images/Pasted image 20250401225621.png" style="width:100%; height:auto; display:block; margin:auto;">

**SWA** — `10.10.200.5`

```bash
int vlan 200
ip add 10.10.200.5 255.255.255.0
ipv6 add 3001:ACAD:ACAD:F::5/64
ex
ip default-gateway 10.10.200.1
```

**SWB** — `10.10.200.4`

```bash
int vlan 200
ip add 10.10.200.4 255.255.255.0
ipv6 add 3001:ACAD:ACAD:F::4/64
ex
ip default-gateway 10.10.200.1
```

**SWC** — `10.10.200.2`

```bash
int vlan 200
ip add 10.10.200.2 255.255.255.0
ipv6 add 3001:ACAD:ACAD:F::2/64
ex
ip default-gateway 10.10.200.1
```

**SWD** — `10.10.200.3`

```bash
int vlan 200
ip add 10.10.200.3 255.255.255.0
ipv6 add 3001:ACAD:ACAD:F::3/64
ex
ip default-gateway 10.10.200.1
```

## 5. Router-on-a-stick

RA conecta con SWC mediante un único enlace troncal (`e1/2`). Cada VLAN se representa con una subinterfaz `e1/2.<vlan>` que lleva la encapsulación 802.1Q y la primera dirección de su subred. Esa dirección actúa como gateway de la VLAN.

**RA**

```bash
en
conf t
host RA
int e1/2
no shut
ex
int e1/2.110
ip add 10.10.110.1 255.255.255.0
ipv6 add 3001:ACAD:ACAD:A::1/64
enc dot1q 110
ex
int e1/2.120
ip add 10.10.120.1 255.255.255.0
ipv6 add 3001:ACAD:ACAD:B::1/64
enc dot1q 120
ex
int e1/2.130
ip add 10.10.130.1 255.255.255.0
ipv6 add 3001:ACAD:ACAD:C::1/64
enc dot1q 130
ex
int e1/2.140
ip add 10.10.140.1 255.255.255.0
ipv6 add 3001:ACAD:ACAD:D::1/64
enc dot1q 140
ex
int e1/2.200
ip add 10.10.200.1 255.255.255.0
ipv6 add 3001:ACAD:ACAD:F::1/64
enc dot1q 200
ex
```

## 6. STP: elección del root bridge por VLAN

Por defecto, STP elige root bridge según la prioridad y la MAC del switch, lo que puede dejar un equipo poco adecuado como raíz de la topología. En este laboratorio se fuerza el root de forma explícita:

- **SWA** es root para las VLAN 110 y 130.
- **SWC** es root para las VLAN 120 y 140.

Así el tráfico de cada VLAN toma el camino más directo hacia su root y se reparte la carga entre los dos switches.

Para comprobar quién es root de una VLAN:

```bash
show spanning-tree vlan [número de vlan]
```

Y para mapear los vecinos y entender la topología física:

```bash
show cdp neighbors
```

<img src="/images/Pasted image 20250401233756.png" style="width:100%; height:auto; display:block; margin:auto;">

**SWA** — root de VLAN 110 y 130

```bash
spanning-tree vlan 110,130 root primary
```

<img src="/images/Pasted image 20250401234835.png" style="width:100%; height:auto; display:block; margin:auto;">

**SWC** — root de VLAN 120 y 140

```bash
spanning-tree vlan 120,140 root primary
```

## 7. OSPFv2 y OSPFv3

RA y BORDE forman vecindad OSPF en el área 0. RA anuncia las subredes de las VLANs y el enlace hacia BORDE; como las subinterfaces no tienen vecinos OSPF, se marcan como `passive-interface`.

<img src="/images/Pasted image 20250401235236.png" style="width:100%; height:auto; display:block; margin:auto;">

**RA — IPv4**

```bash
router ospf 1
router-id 1.1.1.1
network 192.168.11.0 0.0.0.255 area 0
network 10.10.110.0 0.0.0.255 area 0
network 10.10.120.0 0.0.0.255 area 0
network 10.10.130.0 0.0.0.255 area 0
network 10.10.140.0 0.0.0.255 area 0
network 10.10.200.0 0.0.0.255 area 0
passive-interface e1/2.110
passive-interface e1/2.120
passive-interface e1/2.130
passive-interface e1/2.140
passive-interface e1/2.200
ex
```

**RA — IPv6**

```bash
ipv6 unicast-routing
ipv6 router ospf 1
router-id 1.1.1.1
passive-interface e1/2.110
passive-interface e1/2.120
passive-interface e1/2.130
passive-interface e1/2.140
passive-interface e1/2.200
ex
int e0/0
ipv6 ospf 1 area 0
ex
int e1/2.110
ipv6 ospf 1 area 0
ex
int e1/2.120
ipv6 ospf 1 area 0
ex
int e1/2.130
ipv6 ospf 1 area 0
ex
int e1/2.140
ipv6 ospf 1 area 0
ex
int e1/2.200
ipv6 ospf 1 area 0
ex
```

**BORDE — IPv4**

```bash
en
conf t
host BORDE
router ospf 1
router-id 2.2.2.2
network 192.168.11.0 0.0.0.255 area 0
passive-interface e0/1
passive-interface e0/2
ex
```

**BORDE — IPv6**

```bash
ipv6 unicast-routing
ipv6 router ospf 1
router-id 2.2.2.2
passive-interface e0/1
passive-interface e0/2
ex
int e0/0
ipv6 ospf 1 area 0
ex
```

## 8. Rutas por defecto con balanceo de carga

BORDE tiene dos salidas hacia el ISP. Se configuran dos rutas por defecto y se usa la **distancia administrativa** para que la primera sea preferida y la segunda quede como respaldo: a menor distancia, más preferida.

**BORDE**

```bash
ip route 0.0.0.0 0.0.0.0 200.0.0.2
ip route 0.0.0.0 0.0.0.0 201.0.0.2 10
ipv6 route ::/0 3001:ACAD:ACAD:200::2
ipv6 route ::/0 3001:ACAD:ACAD:201::2 10
```

**ISP**

```bash
en
conf t
host ISP
ip route 0.0.0.0 0.0.0.0 200.0.0.1
ip route 0.0.0.0 0.0.0.0 201.0.0.1 10
ipv6 unicast-routing
ipv6 route ::/0 3001:ACAD:ACAD:200::1
ipv6 route ::/0 3001:ACAD:ACAD:201::1 10
```

## 9. Redistribución de la ruta por defecto en OSPF

Para que RA y el resto del dominio OSPF sepan cómo salir a Internet, BORDE inyecta su ruta por defecto con `default-information originate`. El comando debe aplicarse solo en el router que tiene a la vez OSPF y la ruta estática por defecto.

<img src="/images/Pasted image 20250402003745.png" style="width:100%; height:auto; display:block; margin:auto;">

**BORDE — IPv4**

```bash
router ospf 1
default-information originate
ex
```

**BORDE — IPv6**

```bash
ipv6 router ospf 1
default-information originate
ex
```

## Verificación

- **Capa 2**
  - `show vlan brief` — las VLANs deben existir y tener sus puertos asignados.
  - `show interfaces trunk` — los troncales deben permitir las cinco VLANs.
  - `show spanning-tree vlan 110` y `show spanning-tree vlan 120` — SWA y SWC deben aparecer como root de sus VLANs.
  - `show spanning-tree summary` — revisar estados de PortFast y BPDU guard.
- **Administración**
  - `show ip interface brief` y `show ipv6 interface brief` — SVIs de gestión activas.
  - `ping 10.10.200.1` desde cada switch.
- **Routing**
  - `show ip ospf neighbor` — vecindad RA-BORDE en `FULL`.
  - `show ip route ospf` y `show ipv6 route ospf`.
  - `show ip route 0.0.0.0` y `show ipv6 route ::/0` — la ruta por defecto debe apuntar a BORDE.
- **Conectividad extremo a extremo**
  - `ping` entre un PC de la VLAN 110 y otro de la VLAN 140 (pasa por el router-on-a-stick).
  - `ping 8.8.8.8` para validar la salida a Internet.
  - `traceroute` para confirmar el path PC → SWA/SWB → SWC → RA → BORDE → ISP.

# Conclusión

El laboratorio integra una red de campus completa: VLANs, troncales, protección de puertos de acceso, administración remota, router-on-a-stick, STP con root bridge por VLAN, OSPFv2/v6 y salida a Internet con rutas por defecto.

Los puntos críticos al reproducirlo son: que el `duplex` coincida en ambos extremos, que todos los troncales permitan las cinco VLANs, que el root de STP sea el switch correcto para cada VLAN, que las subinterfaces de RA usen la VLAN correcta en `encapsulation dot1q`, y que `default-information originate` se aplique en BORDE y no en RA.
