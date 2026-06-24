import type { AgentRole } from './schema';

// Mapeo de agentes a departamentos para Office Grid

export interface DepartmentMapping {
  name: string;
  description: string;
  agents: AgentRole[];
}

export const DEPARTMENT_MAPPINGS: DepartmentMapping[] = [
  {
    name: 'Planning Department',
    description:
      'Responsable de la concepción, arquitectura y planificación estratégica de proyectos.',
    agents: ['Planner', 'Planificator'],
  },
  {
    name: 'Library Department',
    description: 'Encargado de la investigación, organización y provisión de recursos técnicos.',
    agents: ['Librarian'],
  },
  {
    name: 'Data Department',
    description:
      'Especializado en diseño, gestión y optimización de bases de datos y almacenamiento.',
    agents: ['DBArchitect'],
  },
  {
    name: 'Backend Department',
    description: 'Responsable del desarrollo de lógica de servidor, APIs y servicios backend.',
    agents: ['Backend', 'Connector'],
  },
  {
    name: 'Design Department',
    description: 'Encargado del diseño de interfaces de usuario y experiencias visuales.',
    agents: ['Designer'],
  },
  {
    name: 'QA Department',
    description: 'Dedicado a la garantía de calidad, pruebas y validación de software.',
    agents: ['Tester', 'QualityGate'],
  },
  {
    name: 'Security Department',
    description: 'Especializado en auditoría, protección y cumplimiento de seguridad.',
    agents: ['Security'],
  },
  {
    name: 'Recovery Department',
    description:
      'Responsable de resolver problemas técnicos, restaurar sistemas y mantener estabilidad.',
    agents: ['BuildFixer'],
  },
];

// Función auxiliar para obtener departamento por rol de agente
export function getDepartmentByAgentRole(role: AgentRole): DepartmentMapping | undefined {
  return DEPARTMENT_MAPPINGS.find((dept) => dept.agents.includes(role));
}

// Función auxiliar para obtener todos los roles de un departamento
export function getAgentRolesByDepartment(departmentName: string): AgentRole[] {
  const department = DEPARTMENT_MAPPINGS.find((dept) => dept.name === departmentName);
  return department ? department.agents : [];
}
