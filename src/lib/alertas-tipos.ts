// «Alerta para la próxima evaluación» (migración 20261030520000): nota clínica que sale arriba de la próxima consulta
export type ParaclinicoPedido = { id: string; nombre: string };

export type AlertaClinica = {
  id: string;
  texto: string;
  paraclinicos: ParaclinicoPedido[];
  revisarAntes: string | null;
  estado: "pendiente" | "revisada" | "descartada";
  respuesta: string | null;
  creadaEl: string; // fecha de Caracas
  autor: string | null;
  consultaId: string | null;
  revisadaEnConsulta: string | null;
  automatica: boolean;
};
