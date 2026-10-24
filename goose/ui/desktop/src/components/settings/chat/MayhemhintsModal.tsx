import { useState, useEffect } from 'react';
import { Button } from '../../ui/button';
import { Check } from '../../icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { errorMessage } from '../../../utils/conversionUtils';
import { defineMessages, useIntl } from '../../../i18n';

const i18n = defineMessages({
  dialogTitle: {
    id: 'mayhemhintsModal.dialogTitle',
    defaultMessage: 'Configure Project Hints (.mayhemhints)',
  },
  dialogDescription: {
    id: 'mayhemhintsModal.dialogDescription',
    defaultMessage:
      'Provide additional context about your project to improve communication with Mayhem',
  },
  helpText1: {
    id: 'mayhemhintsModal.helpText1',
    defaultMessage:
      '.mayhemhints is a text file used to provide additional context about your project and improve the communication with Mayhem.',
  },
  helpText2: {
    id: 'mayhemhintsModal.helpText2',
    defaultMessage:
      "Please make sure {bold} extension is enabled in the extensions page. This extension is required to use .mayhemhints. You'll need to restart your session for .mayhemhints updates to take effect.",
  },
  helpText3: {
    id: 'mayhemhintsModal.helpText3',
    defaultMessage: 'See {link} for more information.',
  },
  helpTextLink: {
    id: 'mayhemhintsModal.helpTextLink',
    defaultMessage: 'using .mayhemhints',
  },
  errorReading: {
    id: 'mayhemhintsModal.errorReading',
    defaultMessage: 'Error reading .mayhemhints file: {error}',
  },
  fileFound: {
    id: 'mayhemhintsModal.fileFound',
    defaultMessage: '.mayhemhints file found at: {filePath}',
  },
  fileCreating: {
    id: 'mayhemhintsModal.fileCreating',
    defaultMessage: 'Creating new .mayhemhints file at: {filePath}',
  },
  placeholder: {
    id: 'mayhemhintsModal.placeholder',
    defaultMessage: 'Enter project hints here...',
  },
  savedSuccessfully: {
    id: 'mayhemhintsModal.savedSuccessfully',
    defaultMessage: 'Saved successfully',
  },
  close: {
    id: 'mayhemhintsModal.close',
    defaultMessage: 'Close',
  },
  saving: {
    id: 'mayhemhintsModal.saving',
    defaultMessage: 'Saving...',
  },
  save: {
    id: 'mayhemhintsModal.save',
    defaultMessage: 'Save',
  },
  failedToAccess: {
    id: 'mayhemhintsModal.failedToAccess',
    defaultMessage: 'Failed to access .mayhemhints file',
  },
  failedToSave: {
    id: 'mayhemhintsModal.failedToSave',
    defaultMessage: 'Failed to save .mayhemhints file',
  },
  developer: {
    id: 'mayhemhintsModal.developer',
    defaultMessage: 'Developer',
  },
});

const HelpText = () => {
  const intl = useIntl();

  return (
    <div className="text-sm flex-col space-y-4 text-text-secondary">
      <p>{intl.formatMessage(i18n.helpText1)}</p>
      <p>
        {intl.formatMessage(i18n.helpText2, {
          bold: <span className="font-bold">{intl.formatMessage(i18n.developer)}</span>,
        })}
      </p>
      <p>
        {intl.formatMessage(i18n.helpText3, {
          link: (
            <Button
              variant="link"
              className="text-blue-500 hover:text-blue-600 p-0 h-auto"
              onClick={() =>
                window.open(
                  'https://mayhem-docs.ai/docs/guides/using-mayhemhints/',
                  '_blank'
                )
              }
            >
              {intl.formatMessage(i18n.helpTextLink)}
            </Button>
          ),
        })}
      </p>
    </div>
  );
};

const ErrorDisplay = ({ error }: { error: Error }) => {
  const intl = useIntl();

  return (
    <div className="text-sm text-text-secondary">
      <div className="text-red-600">
        {intl.formatMessage(i18n.errorReading, { error: errorMessage(error) })}
      </div>
    </div>
  );
};

const FileInfo = ({ filePath, found }: { filePath: string; found: boolean }) => {
  const intl = useIntl();

  return (
    <div className="text-sm font-medium mb-2">
      {found ? (
        <div className="text-green-600">
          <Check className="w-4 h-4 inline-block" />{' '}
          {intl.formatMessage(i18n.fileFound, { filePath })}
        </div>
      ) : (
        <div>{intl.formatMessage(i18n.fileCreating, { filePath })}</div>
      )}
    </div>
  );
};

interface MayhemhintsModalProps {
  directory: string;
  setIsMayhemhintsModalOpen: (isOpen: boolean) => void;
}

export const MayhemhintsModal = ({ directory, setIsMayhemhintsModalOpen }: MayhemhintsModalProps) => {
  const intl = useIntl();
  const mayhemhintsFilePath = `${directory}/.mayhemhints`;
  const [mayhemhintsFile, setMayhemhintsFile] = useState<string>('');
  const [mayhemhintsFileFound, setMayhemhintsFileFound] = useState<boolean>(false);
  const [mayhemhintsFileReadError, setMayhemhintsFileReadError] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const fetchMayhemhintsFile = async () => {
      try {
        const { file, error, found } = await window.electron.readMayhemhints();
        setMayhemhintsFile(file);
        setMayhemhintsFileFound(found);
        setMayhemhintsFileReadError(error ?? '');
      } catch (error) {
        console.error('Error fetching .mayhemhints file:', error);
        setMayhemhintsFileReadError(intl.formatMessage(i18n.failedToAccess));
      }
    };
    if (directory) fetchMayhemhintsFile();
  }, [directory, intl]);

  const writeFile = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const saved = await window.electron.writeMayhemhints(mayhemhintsFile);
      if (!saved) {
        throw new Error('Unable to save .mayhemhints');
      }
      setSaveSuccess(true);
      setMayhemhintsFileFound(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error writing .mayhemhints file:', error);
      setMayhemhintsFileReadError(intl.formatMessage(i18n.failedToSave));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => setIsMayhemhintsModalOpen(open)}>
      <DialogContent className="w-[80vw] max-w-[80vw] sm:max-w-[80vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{intl.formatMessage(i18n.dialogTitle)}</DialogTitle>
          <DialogDescription>{intl.formatMessage(i18n.dialogDescription)}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pt-2 pb-4">
          <HelpText />

          <div>
            {mayhemhintsFileReadError ? (
              <ErrorDisplay error={new Error(mayhemhintsFileReadError)} />
            ) : (
              <div className="space-y-2">
                <FileInfo filePath={mayhemhintsFilePath} found={mayhemhintsFileFound} />
                <textarea
                  value={mayhemhintsFile}
                  className="w-full h-80 border rounded-md p-2 text-sm resize-none bg-background-primary text-text-primary border-border-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onChange={(event) => setMayhemhintsFile(event.target.value)}
                  placeholder={intl.formatMessage(i18n.placeholder)}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          {saveSuccess && (
            <span className="text-green-600 text-sm flex items-center gap-1 mr-auto">
              <Check className="w-4 h-4" />
              {intl.formatMessage(i18n.savedSuccessfully)}
            </span>
          )}
          <Button variant="outline" onClick={() => setIsMayhemhintsModalOpen(false)}>
            {intl.formatMessage(i18n.close)}
          </Button>
          <Button onClick={writeFile} disabled={isSaving}>
            {isSaving ? intl.formatMessage(i18n.saving) : intl.formatMessage(i18n.save)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
