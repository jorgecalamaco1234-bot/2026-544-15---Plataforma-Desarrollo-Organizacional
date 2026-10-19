// Datos de ejemplo genéricos de la "Empresa Demo". Se cargan en la base de datos la primera vez
// (o al restablecer). Los ids de puestos son locales a este archivo: al sembrar se reemplazan por los reales.

export const USUARIOS = [
  { email: "admin@empresademo.mx", nombre: "Ana Ruiz", rol: "Administrador" },
  { email: "rh@empresademo.mx", nombre: "Luis Mena", rol: "Recursos Humanos" },
  { email: "calidad@empresademo.mx", nombre: "Marta Soto", rol: "Calidad" },
  { email: "direccion@empresademo.mx", nombre: "Laura Vega", rol: "Dirección" },
];
// Contraseña de las cuentas de prueba (se guarda cifrada en la base de datos).
export const PASSWORD_DEMO = process.env.DEMO_PASSWORD || "demo2026";

export const PUESTOS = [
{id:1,parent:null,name:"Director General",dept:"Dirección General",resp:"Definir estrategia; tomar decisiones ejecutivas; supervisar resultados.",obj:"Dirigir la operación general de la empresa y asegurar el cumplimiento de los objetivos organizacionales.",comp:["Liderazgo","Visión estratégica","Toma de decisiones"],perfil:"Licenciatura en Administración o afín; 8 años de experiencia directiva.",status:"Completa"},
{id:2,parent:1,name:"Gerente de Recursos Humanos",dept:"Recursos Humanos",resp:"Gestionar talento; coordinar capacitación; actualizar información de puestos.",obj:"Administrar el organigrama y las descripciones de puesto, y coordinar el desarrollo del personal.",comp:["Empatía","Negociación","Manejo de conflictos"],perfil:"Licenciatura en Psicología o Administración; 5 años en RH.",status:"Completa"},
{id:3,parent:2,name:"Especialista de RH",dept:"Recursos Humanos",resp:"Apoyar reclutamiento; mantener expedientes; coordinar inducción.",obj:"",comp:[],perfil:"",status:"Pendiente"},
{id:4,parent:1,name:"Gerente de Calidad",dept:"Calidad",resp:"Coordinar el sistema de calidad; dar seguimiento a indicadores; preparar auditorías.",obj:"Mantener el sistema de gestión de calidad alineado a ISO 9001 y coordinar las auditorías internas y externas.",comp:["Pensamiento analítico","Conocimiento de ISO 9001","Comunicación"],perfil:"Ingeniería Industrial o afín; 5 años en sistemas de calidad.",status:"Completa"},
{id:5,parent:4,name:"Coordinador de Calidad",dept:"Calidad",resp:"Dar seguimiento a indicadores; coordinar documentación; apoyar auditorías internas.",obj:"Coordinar el control documental y dar seguimiento a los indicadores de calidad del área.",comp:["Organización","Redacción de informes","Atención al detalle"],perfil:"Ingeniería o TSU; curso de auditor interno ISO 9001.",status:"Completa"},
{id:6,parent:5,name:"Analista de Calidad",dept:"Calidad",resp:"Capturar registros; revisar evidencias; apoyar análisis de incidencias.",obj:"Registrar y analizar la evidencia documental que sostiene el sistema de gestión de calidad.",comp:["Atención al detalle","Manejo de Excel","Trabajo en equipo"],perfil:"TSU o licenciatura en área afín; 1 a 2 años de experiencia.",status:"Completa"},
{id:7,parent:1,name:"Gerente de Operaciones",dept:"Operaciones",resp:"Supervisar operación; coordinar recursos; monitorear productividad.",obj:"Planear y controlar la operación diaria, asegurando el cumplimiento de metas de calidad y entrega.",comp:["Planeación","Liderazgo operativo","Mejora continua"],perfil:"Ingeniería Industrial o Mecánica; 6 años en manufactura.",status:"Completa"},
{id:8,parent:7,name:"Supervisor de Operaciones",dept:"Operaciones",resp:"Coordinar personal; vigilar procesos; reportar incidencias.",obj:"",comp:[],perfil:"",status:"Pendiente"},
{id:9,parent:8,name:"Líder de Producción",dept:"Operaciones",resp:"Asignar tareas en línea; verificar cumplimiento del plan; reportar paros.",obj:"",comp:[],perfil:"",status:"Pendiente"}];

const HI = (v, fecha, autor, nota) => ({ v, fecha, autor, nota });
export const MODULOS = {
  procesos: [
    { id: 1, codigo: "PR-CAL-01", nombre: "Control de documentos", dept: "Calidad", responsable: 5, version: 2, estado: "Aprobado", aprobadoPor: "Marta Soto", aprobadoEl: "15 sept 2026",
      objetivo: "Asegurar que los documentos del sistema de gestión estén identificados, revisados, aprobados y disponibles en su versión vigente.",
      alcance: "Aplica a procedimientos, instructivos y formatos de todas las áreas de la empresa.",
      entradas: ["Solicitud de alta o cambio de documento", "Documento en borrador"], salidas: ["Documento aprobado y publicado", "Lista maestra de documentos actualizada"],
      pasos: [{ actividad: "Solicitar el alta o cambio del documento", responsable: "Analista de Calidad" }, { actividad: "Redactar o actualizar el borrador", responsable: "Coordinador de Calidad" }, { actividad: "Revisar el contenido con el área dueña", responsable: "Gerente de Calidad" }, { actividad: "Aprobar y asignar versión", responsable: "Gerente de Calidad" }, { actividad: "Publicar y retirar la versión obsoleta", responsable: "Coordinador de Calidad" }, { actividad: "Actualizar la lista maestra de documentos", responsable: "Analista de Calidad" }],
      indicadores: ["% de documentos vigentes", "Días promedio de aprobación"],
      historial: [HI(1, "02 jun 2026", "Marta Soto", "Creado"), HI(1, "05 jun 2026", "Marta Soto", "Aprobado"), HI(2, "12 sept 2026", "Marta Soto", "Nueva versión: se agregó la lista maestra"), HI(2, "15 sept 2026", "Marta Soto", "Aprobado")] },
    { id: 2, codigo: "PR-REC-01", nombre: "Reclutamiento y selección", dept: "Recursos Humanos", responsable: 3, version: 1, estado: "En revisión",
      objetivo: "Cubrir las vacantes con candidatos que cumplan el perfil del puesto en el menor tiempo posible.",
      alcance: "Aplica a todas las vacantes, desde la solicitud del área hasta la contratación.",
      entradas: ["Requisición de personal", "Descripción de puesto vigente"], salidas: ["Candidato contratado", "Expediente integrado"],
      pasos: [{ actividad: "Recibir y validar la requisición de personal", responsable: "Especialista de RH" }, { actividad: "Publicar la vacante", responsable: "Especialista de RH" }, { actividad: "Filtrar candidatos contra el perfil", responsable: "Especialista de RH" }, { actividad: "Entrevistar a los finalistas", responsable: "Gerente de Recursos Humanos" }, { actividad: "Presentar la oferta y contratar", responsable: "Gerente de Recursos Humanos" }],
      indicadores: ["Días para cubrir una vacante"], historial: [HI(1, "28 sept 2026", "Luis Mena", "Creado"), HI(1, "30 sept 2026", "Luis Mena", "Enviado a revisión")] },
    { id: 3, codigo: "PR-OPE-01", nombre: "Atención de no conformidades en producción", dept: "Operaciones", responsable: 8, version: 1, estado: "Borrador",
      objetivo: "Contener, analizar y corregir los productos no conformes detectados en la línea.",
      alcance: "Aplica a las líneas de producción y al producto en proceso.", entradas: ["Reporte de producto no conforme"], salidas: ["Acción correctiva registrada"],
      pasos: [{ actividad: "Detectar y separar el producto no conforme", responsable: "Líder de Producción" }, { actividad: "Registrar la no conformidad", responsable: "Supervisor de Operaciones" }, { actividad: "Analizar la causa raíz", responsable: "Analista de Calidad" }, { actividad: "Definir y aplicar la acción correctiva", responsable: "Supervisor de Operaciones" }],
      indicadores: ["% de producto no conforme"], historial: [HI(1, "03 oct 2026", "Marta Soto", "Creado")] },
  ],
  competencias: [
    { id: 1, codigo: "CMP-01", nombre: "Liderazgo", tipo: "Directiva", estado: "Aprobado", version: 1, puestos: [1, 7], aprobadoPor: "Luis Mena", aprobadoEl: "10 sept 2026",
      descripcion: "Capacidad para orientar, motivar y desarrollar a un equipo hacia el logro de objetivos comunes.",
      niveles: ["Coordina tareas de su equipo cuando se le solicita.", "Asigna responsabilidades y da seguimiento a su cumplimiento.", "Desarrolla a sus colaboradores y gestiona el desempeño del equipo.", "Define la dirección del área e inspira a otros líderes."],
      comportamientos: ["Comunica objetivos claros", "Da retroalimentación oportuna", "Delega según capacidades"], historial: [HI(1, "08 sept 2026", "Luis Mena", "Creado"), HI(1, "10 sept 2026", "Luis Mena", "Aprobado")] },
    { id: 2, codigo: "CMP-02", nombre: "Conocimiento de ISO 9001", tipo: "Técnica", estado: "Aprobado", version: 1, puestos: [4, 5, 6], aprobadoPor: "Marta Soto", aprobadoEl: "11 sept 2026",
      descripcion: "Dominio de los requisitos de la norma ISO 9001 y su aplicación en los procesos de la empresa.",
      niveles: ["Conoce la estructura general de la norma.", "Aplica los requisitos en los procesos de su área.", "Prepara y conduce auditorías internas.", "Diseña y mejora el sistema de gestión de calidad."],
      comportamientos: ["Identifica requisitos aplicables", "Mantiene evidencia documental", "Propone acciones de mejora"], historial: [HI(1, "09 sept 2026", "Marta Soto", "Creado"), HI(1, "11 sept 2026", "Marta Soto", "Aprobado")] },
    { id: 3, codigo: "CMP-03", nombre: "Atención al detalle", tipo: "Conductual", estado: "Aprobado", version: 1, puestos: [], aprobadoPor: "Marta Soto", aprobadoEl: "11 sept 2026",
      descripcion: "Capacidad para realizar el trabajo con precisión y detectar errores o inconsistencias.",
      niveles: ["Revisa su trabajo antes de entregarlo.", "Detecta errores en el trabajo propio y de otros.", "Establece controles para prevenir errores.", "Diseña mecanismos de verificación para el área."],
      comportamientos: ["Verifica datos antes de registrarlos", "Sigue los procedimientos al pie de la letra"], historial: [HI(1, "09 sept 2026", "Marta Soto", "Creado"), HI(1, "11 sept 2026", "Marta Soto", "Aprobado")] },
    { id: 4, codigo: "CMP-04", nombre: "Mejora continua", tipo: "Técnica", estado: "En revisión", version: 1, puestos: [7, 8],
      descripcion: "Capacidad para identificar oportunidades y aplicar metodologías que mejoren los procesos.",
      niveles: ["Reporta problemas que observa en su área.", "Participa en proyectos de mejora.", "Lidera proyectos de mejora con herramientas como PDCA o 5 porqués.", "Impulsa una cultura de mejora en toda la organización."],
      comportamientos: ["Propone mejoras con datos", "Mide el resultado de los cambios"], historial: [HI(1, "01 oct 2026", "Ana Ruiz", "Creado"), HI(1, "02 oct 2026", "Ana Ruiz", "Enviado a revisión")] },
    { id: 5, codigo: "CMP-05", nombre: "Negociación", tipo: "Conductual", estado: "Borrador", version: 1, puestos: [],
      descripcion: "Capacidad para llegar a acuerdos que beneficien a las partes involucradas.", niveles: ["", "", "", ""], comportamientos: [], historial: [HI(1, "04 oct 2026", "Luis Mena", "Creado")] },
  ],
  politicas: [
    { id: 1, codigo: "POL-CAL-01", titulo: "Política de calidad", categoria: "Calidad", dept: "Calidad", aplica: ["Dirección General", "Recursos Humanos", "Calidad", "Operaciones"], version: 1, estado: "Aprobado", aprobadoPor: "Ana Ruiz", aprobadoEl: "20 ago 2026",
      objetivo: "Establecer el compromiso de la empresa con la satisfacción del cliente y la mejora continua.",
      alcance: "Aplica a todas las áreas y a todo el personal de la empresa.",
      lineamientos: ["Cumplir los requisitos del cliente y los aplicables a nuestros productos.", "Medir el desempeño de los procesos con indicadores.", "Atender y analizar toda queja de cliente.", "Capacitar al personal en sus funciones y en el sistema de gestión.", "Revisar esta política al menos una vez al año."],
      responsabilidades: ["Dirección General: aprobar y difundir la política.", "Calidad: dar seguimiento a su cumplimiento.", "Todas las áreas: aplicarla en su trabajo diario."],
      historial: [HI(1, "15 ago 2026", "Marta Soto", "Creado"), HI(1, "20 ago 2026", "Ana Ruiz", "Aprobado")] },
    { id: 2, codigo: "POL-REC-01", titulo: "Política de capacitación", categoria: "Recursos Humanos", dept: "Recursos Humanos", aplica: ["Recursos Humanos", "Operaciones", "Calidad"], version: 1, estado: "En revisión",
      objetivo: "Asegurar que el personal cuente con los conocimientos necesarios para su puesto.", alcance: "Aplica a todo el personal de planta y administrativo.",
      lineamientos: ["Elaborar un plan anual de capacitación por área.", "Dar inducción a todo el personal de nuevo ingreso.", "Registrar la asistencia y evaluar cada curso.", "Revisar las necesidades de capacitación cada seis meses."],
      responsabilidades: ["Recursos Humanos: elaborar y dar seguimiento al plan.", "Jefes de área: detectar necesidades de su equipo."],
      historial: [HI(1, "25 sept 2026", "Luis Mena", "Creado"), HI(1, "29 sept 2026", "Luis Mena", "Enviado a revisión")] },
    { id: 3, codigo: "POL-OPE-01", titulo: "Política de seguridad en planta", categoria: "Seguridad e higiene", dept: "Operaciones", aplica: ["Operaciones"], version: 1, estado: "Borrador",
      objetivo: "Prevenir accidentes en las áreas de producción.", alcance: "Aplica al personal y visitantes en planta.",
      lineamientos: ["Usar el equipo de protección personal en todo momento.", "Reportar cualquier condición insegura."], responsabilidades: ["Supervisor de Operaciones: verificar su cumplimiento."],
      historial: [HI(1, "05 oct 2026", "Ana Ruiz", "Creado")] },
  ],
  kpis: [
    { id: 1, codigo: "KPI-REC-01", nombre: "Rotación de personal", dept: "Recursos Humanos", responsable: 2, formula: "Bajas del periodo / plantilla promedio × 100", unidad: "%", meta: 3, sentido: "menor", frecuencia: "Mensual", valores: [4.1, 3.8, 3.5, 3.9, 3.2, 2.8], estado: "Aprobado", version: 1, aprobadoPor: "Luis Mena", aprobadoEl: "01 sept 2026", descripcion: "Mide qué porcentaje del personal deja la empresa cada mes.", historial: [HI(1, "01 sept 2026", "Luis Mena", "Aprobado")] },
    { id: 2, codigo: "KPI-REC-02", nombre: "Cumplimiento del plan de capacitación", dept: "Recursos Humanos", responsable: 3, formula: "Cursos impartidos / cursos programados × 100", unidad: "%", meta: 90, sentido: "mayor", frecuencia: "Mensual", valores: [78, 82, 85, 88, 91, 86], estado: "Aprobado", version: 1, aprobadoPor: "Luis Mena", aprobadoEl: "01 sept 2026", descripcion: "Avance del plan anual de capacitación.", historial: [HI(1, "01 sept 2026", "Luis Mena", "Aprobado")] },
    { id: 3, codigo: "KPI-CAL-01", nombre: "Producto no conforme", dept: "Calidad", responsable: 4, formula: "Piezas no conformes / piezas producidas × 100", unidad: "%", meta: 2, sentido: "menor", frecuencia: "Mensual", valores: [2.6, 2.4, 2.1, 1.9, 1.8, 1.6], estado: "Aprobado", version: 1, aprobadoPor: "Marta Soto", aprobadoEl: "02 sept 2026", descripcion: "Porcentaje de producción que no cumple especificaciones.", historial: [HI(1, "02 sept 2026", "Marta Soto", "Aprobado")] },
    { id: 4, codigo: "KPI-CAL-02", nombre: "Auditorías internas realizadas", dept: "Calidad", responsable: 5, formula: "Auditorías realizadas / auditorías programadas × 100", unidad: "%", meta: 100, sentido: "mayor", frecuencia: "Trimestral", valores: [100, 75, 100], estado: "Aprobado", version: 1, aprobadoPor: "Marta Soto", aprobadoEl: "02 sept 2026", descripcion: "Cumplimiento del programa de auditorías internas.", historial: [HI(1, "02 sept 2026", "Marta Soto", "Aprobado")] },
    { id: 5, codigo: "KPI-OPE-01", nombre: "Eficiencia general de la línea (OEE)", dept: "Operaciones", responsable: 7, formula: "Disponibilidad × rendimiento × calidad", unidad: "%", meta: 80, sentido: "mayor", frecuencia: "Mensual", valores: [72, 74, 71, 76, 78, 77], estado: "En revisión", version: 1, descripcion: "Aprovechamiento real de la línea de producción.", historial: [HI(1, "30 sept 2026", "Ana Ruiz", "Enviado a revisión")] },
  ],
};

/* ---------- multiempresa ---------- */
// Logos de ejemplo (SVG generados aquí; los logos que suben los usuarios se validan como PNG, JPG o WebP).
const logoSvg = (iniciales, nombre, color, ancho = 120 + nombre.length * 16) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="110" viewBox="0 0 ${ancho} 110"><rect x="4" y="9" width="92" height="92" rx="22" fill="${color}"/><text x="50" y="69" font-family="Open Sans,Arial,sans-serif" font-size="38" font-weight="800" fill="#fff" text-anchor="middle">${iniciales}</text><text x="114" y="64" font-family="Open Sans,Arial,sans-serif" font-size="27" font-weight="700" fill="#231F20">${nombre}</text></svg>`);

// plantilla: qué datos de ejemplo se cargan al crear o restablecer la empresa ("demo", "norte" o "vacia")
export const EMPRESAS = [
  { clave: "demo", nombre: "Empresa Demo", plantilla: "demo", logo: logoSvg("ED", "Empresa Demo", "#0032A0"), usuarios: USUARIOS },
  {
    clave: "norte", nombre: "Manufacturas del Norte", plantilla: "norte", logo: logoSvg("MN", "Manufacturas del Norte", "#FF661B"),
    usuarios: [
      { email: "admin@manufacturasnorte.mx", nombre: "Carmen Ríos", rol: "Administrador" },
      { email: "rh@manufacturasnorte.mx", nombre: "Raúl Ortiz", rol: "Recursos Humanos" },
      { email: "calidad@manufacturasnorte.mx", nombre: "Sofía Lara", rol: "Calidad" },
    ],
  },
];

// Cuenta de IOT Technologies que da de alta las empresas (no pertenece a ninguna).
export const SUPER = { email: "superadmin@plataforma-do.mx", nombre: "Administración IOT", rol: "Súper administrador" };

export const PUESTOS_NORTE = [
{id:1,parent:null,name:"Director de Planta",dept:"Dirección",resp:"Dirigir la operación de la planta; aprobar presupuestos; dar seguimiento a resultados.",obj:"Asegurar que la planta cumpla sus metas de producción, calidad, costo y seguridad.",comp:["Liderazgo","Visión estratégica","Toma de decisiones"],perfil:"Ingeniería Industrial o afín; 10 años en manufactura, 5 en puestos directivos.",status:"Completa"},
{id:2,parent:1,name:"Gerente de Producción",dept:"Producción",resp:"Planear la producción; coordinar turnos; controlar mermas.",obj:"Cumplir el plan de producción con la calidad y los costos esperados.",comp:["Planeación","Liderazgo operativo","Mejora continua"],perfil:"Ingeniería Industrial o Mecánica; 6 años en manufactura.",status:"Completa"},
{id:3,parent:1,name:"Gerente de Calidad",dept:"Calidad",resp:"Coordinar el sistema de calidad; atender auditorías de clientes; dar seguimiento a reclamaciones.",obj:"",comp:[],perfil:"",status:"Pendiente"},
{id:4,parent:1,name:"Jefe de Recursos Humanos",dept:"Recursos Humanos",resp:"Reclutar personal operativo; coordinar capacitación; administrar nómina.",obj:"",comp:[],perfil:"",status:"Pendiente"},
{id:5,parent:2,name:"Jefe de Mantenimiento",dept:"Mantenimiento",resp:"Programar mantenimiento preventivo; atender fallas; controlar refacciones.",obj:"",comp:[],perfil:"",status:"Pendiente"},
{id:6,parent:2,name:"Supervisor de Línea",dept:"Producción",resp:"Asignar operadores; vigilar la calidad en línea; reportar paros.",obj:"Asegurar que la línea cumpla el plan del turno con la calidad requerida.",comp:["Liderazgo","Comunicación","Solución de problemas"],perfil:"TSU o Ingeniería; 3 años como líder de línea.",status:"Completa"},
{id:7,parent:3,name:"Ingeniero de Calidad",dept:"Calidad",resp:"Analizar no conformidades; elaborar planes de control; capacitar en inspección.",obj:"",comp:[],perfil:"",status:"Pendiente"}];
